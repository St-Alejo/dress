import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { randomUUID } from 'node:crypto';
import { LETTER_SIZES, type GarmentCategory } from '@vestirse/shared-types';
import { AdminGuard } from '../../common/guards';
import { PrismaService } from '../../common/prisma.service';
import { ObjectStorage } from '../../common/storage';
import { coverageViolations } from '../catalog/domain/body-coverage';
import { toGarmentItem } from '../catalog/infrastructure/prisma-catalog.repository';
import { GARMENT_STYLES, type GarmentArt, type GarmentStyle, type Pattern } from '../catalog/infrastructure/illustration/garment-art';
import { IllustrationPublisher } from '../catalog/infrastructure/illustration/illustration-publisher';
import type { AvatarSpec, HairStyle } from '../catalog/infrastructure/illustration/renderer';
import { MetricsService } from '../metrics/metrics.module';

const CATEGORIES: GarmentCategory[] = ['top', 'bottom', 'dress', 'outerwear', 'footwear', 'accessory'];
const PATTERNS: Pattern[] = ['solid', 'stripes', 'dots', 'check'];
const HAIR: HairStyle[] = ['short', 'long', 'bun', 'curly', 'none'];

class SizeEntryDto {
  @IsString() @MaxLength(10) size: string;
  @IsOptional() @IsNumber({}, { each: true }) chest?: [number, number];
  @IsOptional() @IsNumber({}, { each: true }) waist?: [number, number];
  @IsOptional() @IsNumber({}, { each: true }) hip?: [number, number];
  @IsOptional() @IsNumber({}, { each: true }) height?: [number, number];
}

class GarmentDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsUUID() brandId: string;
  @IsIn(CATEGORIES) category: GarmentCategory;
  @IsIn(GARMENT_STYLES as unknown as string[]) style: GarmentStyle;
  @IsHexColor() color: string;
  @IsIn(PATTERNS) pattern: Pattern;
  @IsInt() @Min(0) priceCents: number;
  @IsIn(['none', 'low', 'medium', 'high']) stretch: 'none' | 'low' | 'medium' | 'high';
  @IsOptional() @IsString() @MaxLength(80) fabricNotes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) knownLimitations?: string[];
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SizeEntryDto) sizeChart: SizeEntryDto[];
}

class GarmentPatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsIn(PATTERNS) pattern?: Pattern;
  @IsOptional() @IsString() @MaxLength(80) fabricNotes?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SizeEntryDto) sizeChart?: SizeEntryDto[];
}

class BrandDto {
  @IsString() @MinLength(2) @MaxLength(40) name: string;
}

class BodyModelDto {
  @IsString() @MinLength(2) @MaxLength(40) bodyTypeTag: string;
  @IsIn(LETTER_SIZES as unknown as string[]) typicalSize: string;
  @IsInt() @Min(130) @Max(220) heightMin: number;
  @IsInt() @Min(130) @Max(220) heightMax: number;
  @IsHexColor() skinTone: string;
  @IsIn(HAIR) hair: HairStyle;
  @IsHexColor() hairColor: string;
  @IsNumber() @Min(28) @Max(70) shoulderCm: number;
  @IsNumber() @Min(60) @Max(180) chestCm: number;
  @IsNumber() @Min(50) @Max(180) waistCm: number;
  @IsNumber() @Min(60) @Max(180) hipCm: number;
}

class MetricsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

const sizeRows = (chart: SizeEntryDto[]) =>
  chart.map((e, i) => ({
    size: e.size,
    sortOrder: i,
    chestMin: e.chest?.[0], chestMax: e.chest?.[1],
    waistMin: e.waist?.[0], waistMax: e.waist?.[1],
    hipMin: e.hip?.[0], hipMax: e.hip?.[1],
    heightMin: e.height?.[0], heightMax: e.height?.[1],
  }));

@Injectable()
export class AdminService {
  private readonly publisher: IllustrationPublisher;

  constructor(
    private readonly prisma: PrismaService,
    storage: ObjectStorage,
    private readonly metrics: MetricsService,
  ) {
    this.publisher = new IllustrationPublisher(storage);
  }

  async listGarments() {
    const rows = await this.prisma.garment.findMany({
      include: { brand: true, sizeChart: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({ ...toGarmentItem(r), style: r.style, pattern: r.pattern, active: r.active }));
  }

  async createGarment(dto: GarmentDto) {
    const id = randomUUID();
    const art: GarmentArt = { id, style: dto.style, color: dto.color, pattern: dto.pattern };
    const keys = await this.publisher.publishGarment(id, dto.category, art);
    await this.prisma.garment.create({
      data: {
        id,
        name: dto.name,
        brandId: dto.brandId,
        category: dto.category,
        style: dto.style,
        pattern: dto.pattern,
        color: dto.color,
        priceCents: dto.priceCents,
        stretch: dto.stretch,
        fabricNotes: dto.fabricNotes,
        knownLimitations: dto.knownLimitations ?? [],
        imageFrontKey: keys.front,
        imageFlatKey: keys.flat,
        imageOverlayKey: keys.overlay,
        sizeChart: { create: sizeRows(dto.sizeChart) },
      },
    });
    await this.renderPreviewsForGarment(id);
    return { id };
  }

  async updateGarment(id: string, dto: GarmentPatchDto) {
    const current = await this.prisma.garment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException();
    await this.prisma.$transaction(async (tx) => {
      await tx.garment.update({
        where: { id },
        data: { name: dto.name, priceCents: dto.priceCents, active: dto.active, color: dto.color, pattern: dto.pattern, fabricNotes: dto.fabricNotes },
      });
      if (dto.sizeChart) {
        await tx.sizeChartEntry.deleteMany({ where: { garmentId: id } });
        await tx.sizeChartEntry.createMany({ data: sizeRows(dto.sizeChart).map((r) => ({ ...r, garmentId: id })) });
      }
    });
    if (dto.color || dto.pattern) {
      const art: GarmentArt = { id, style: current.style as GarmentStyle, color: dto.color ?? current.color, pattern: (dto.pattern ?? current.pattern) as Pattern };
      await this.publisher.publishGarment(id, current.category, art);
      await this.renderPreviewsForGarment(id);
    }
    return { id };
  }

  listBrands() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }

  createBrand(dto: BrandDto) {
    return this.prisma.brand.create({ data: { name: dto.name } });
  }

  listBodyModels() {
    return this.prisma.bodyModel.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createBodyModel(dto: BodyModelDto) {
    if (dto.heightMin > dto.heightMax) throw new ConflictException('rango de altura inválido');
    const id = randomUUID();
    const spec = this.specOf(dto);
    const avatarKey = await this.publisher.publishAvatar(id, spec);
    const count = await this.prisma.bodyModel.count();
    await this.prisma.bodyModel.create({
      data: {
        id,
        bodyTypeTag: dto.bodyTypeTag,
        typicalSize: dto.typicalSize,
        heightMin: dto.heightMin,
        heightMax: dto.heightMax,
        skinTone: dto.skinTone,
        shape: { ...spec.shape, hair: dto.hair, hairColor: dto.hairColor },
        avatarKey,
        sortOrder: count,
      },
    });
    const garments = await this.prisma.garment.findMany();
    for (const g of garments) {
      const imageKey = await this.publisher.publishPreview(id, g.id, spec, g.category, this.artOf(g));
      await this.prisma.bodyModelPreview.create({ data: { bodyModelId: id, garmentId: g.id, imageKey } });
    }
    return { id };
  }

  /** Nunca se permite dejar el catálogo sin cobertura de tallas (regla 4). */
  async deleteBodyModel(id: string) {
    const bodies = await this.prisma.bodyModel.findMany({ select: { id: true, typicalSize: true, bodyTypeTag: true } });
    if (!bodies.some((b) => b.id === id)) throw new NotFoundException();
    const problems = coverageViolations(bodies.filter((b) => b.id !== id));
    if (problems.length) throw new ConflictException(`no se puede eliminar: ${problems.join('; ')}`);
    await this.prisma.bodyModel.delete({ where: { id } });
    return { id };
  }

  async metricsSummary(days?: number) {
    const since = days ? new Date(Date.now() - days * 86_400_000) : undefined;
    const [summary, calibrations] = await Promise.all([
      this.metrics.summary(since),
      this.prisma.brandCalibration.findMany({ include: { brand: true }, orderBy: { sampleSize: 'desc' } }),
    ]);
    return {
      ...summary,
      calibrations: calibrations.map((c) => ({
        brand: c.brand.name,
        category: c.category,
        sampleSize: c.sampleSize,
        meanShift: c.sampleSize ? c.shiftSum / c.sampleSize : 0,
      })),
    };
  }

  private async renderPreviewsForGarment(garmentId: string) {
    const garment = await this.prisma.garment.findUniqueOrThrow({ where: { id: garmentId } });
    const bodies = await this.prisma.bodyModel.findMany();
    for (const b of bodies) {
      const shape = b.shape as unknown as AvatarSpec['shape'] & { hair: HairStyle; hairColor: string };
      const spec: AvatarSpec = { shape, skinTone: b.skinTone, hair: shape.hair, hairColor: shape.hairColor };
      const imageKey = await this.publisher.publishPreview(b.id, garmentId, spec, garment.category, this.artOf(garment));
      await this.prisma.bodyModelPreview.upsert({
        where: { bodyModelId_garmentId: { bodyModelId: b.id, garmentId } },
        create: { bodyModelId: b.id, garmentId, imageKey },
        update: { imageKey },
      });
    }
  }

  private artOf(g: { id: string; style: string; color: string; pattern: string }): GarmentArt {
    return { id: g.id, style: g.style as GarmentStyle, color: g.color, pattern: g.pattern as Pattern };
  }

  private specOf(dto: BodyModelDto): AvatarSpec {
    return {
      shape: {
        heightCm: Math.round((dto.heightMin + dto.heightMax) / 2),
        shoulderCm: dto.shoulderCm,
        chestCm: dto.chestCm,
        waistCm: dto.waistCm,
        hipCm: dto.hipCm,
      },
      skinTone: dto.skinTone,
      hair: dto.hair,
      hairColor: dto.hairColor,
    };
  }
}

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('garments') garments() { return this.admin.listGarments(); }
  @Post('garments') createGarment(@Body() dto: GarmentDto) { return this.admin.createGarment(dto); }
  @Patch('garments/:id') updateGarment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GarmentPatchDto) { return this.admin.updateGarment(id, dto); }
  @Get('brands') brands() { return this.admin.listBrands(); }
  @Post('brands') createBrand(@Body() dto: BrandDto) { return this.admin.createBrand(dto); }
  @Get('body-models') bodyModels() { return this.admin.listBodyModels(); }
  @Post('body-models') createBodyModel(@Body() dto: BodyModelDto) { return this.admin.createBodyModel(dto); }
  @Delete('body-models/:id') deleteBodyModel(@Param('id', ParseUUIDPipe) id: string) { return this.admin.deleteBodyModel(id); }
  @Get('metrics') metrics(@Query() q: MetricsQuery) { return this.admin.metricsSummary(q.days); }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
