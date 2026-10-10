import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance, Type } from 'class-transformer';
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
  validateSync,
} from 'class-validator';
import { memoryStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { LETTER_SIZES, type GarmentCategory, type GarmentPhotoType } from '@vestirse/shared-types';
import { AdminGuard } from '../../common/guards';
import { PrismaService } from '../../common/prisma.service';
import { ObjectStorage } from '../../common/storage';
import { coverageViolations } from '../catalog/domain/body-coverage';
import { GARMENT_STYLES, type GarmentStyle } from '../catalog/domain/garment-style';
import { toGarmentItem } from '../catalog/infrastructure/prisma-catalog.repository';
import { AiWorkerClient } from '../ai-settings/ai-settings.module';
import { MetricsService } from '../metrics/metrics.module';

const CATEGORIES: GarmentCategory[] = ['top', 'bottom', 'dress', 'outerwear', 'footwear', 'accessory'];
const PHOTO_TYPES: GarmentPhotoType[] = ['flat-lay', 'model'];
const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** Mismo lienzo y fondo que las fotos del seed (services/ai-worker/scripts/prepare_catalog.py). */
const CANVAS = { width: 768, height: 1024, background: '#f6f5f2' };
const photoUpload = () => FileInterceptor('photo', { storage: memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });

type Upload = { buffer: Buffer; mimetype: string } | undefined;

/** Los formularios con foto llegan como multipart: los campos viajan en `data` como JSON. */
function parseData<T extends object>(cls: new () => T, raw: unknown): T {
  let plain: unknown;
  try {
    plain = JSON.parse(String(raw ?? ''));
  } catch {
    throw new BadRequestException('data debe ser JSON');
  }
  const dto = plainToInstance(cls, plain);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) throw new BadRequestException(errors.map((e) => Object.values(e.constraints ?? { [e.property]: 'inválido' })).flat());
  return dto;
}

/** Foto de tienda: sin metadatos, centrada en el lienzo común del catálogo. */
async function storePhoto(file: Upload): Promise<Buffer> {
  if (!file) throw new BadRequestException('falta la foto');
  if (!ACCEPTED_MIME.includes(file.mimetype)) throw new UnprocessableEntityException('formato no admitido');
  try {
    return await sharp(file.buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(CANVAS.width, CANVAS.height, { fit: 'contain', background: CANVAS.background })
      .flatten({ background: CANVAS.background })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    throw new UnprocessableEntityException('la imagen no se pudo leer');
  }
}

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
  @IsIn(PHOTO_TYPES) photoType: GarmentPhotoType;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
    private readonly metrics: MetricsService,
    private readonly worker: AiWorkerClient,
  ) {}

  async listGarments() {
    const rows = await this.prisma.garment.findMany({
      include: { brand: true, sizeChart: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({ ...toGarmentItem(r), style: r.style, active: r.active }));
  }

  /** Etiquetado automático a partir de la foto: solo propone valores para el formulario. */
  async describeGarment(file: Upload) {
    return this.worker.describeGarment(await storePhoto(file));
  }

  /** Sin foto no hay prenda: la tienda no tiene imagen de respaldo. */
  async createGarment(dto: GarmentDto, file: Upload) {
    const id = randomUUID();
    const photoKey = `catalog/garments/${id}/photo.jpg`;
    await this.storage.put(photoKey, await storePhoto(file), 'image/jpeg');
    await this.prisma.garment.create({
      data: {
        id,
        name: dto.name,
        brandId: dto.brandId,
        category: dto.category,
        style: dto.style,
        color: dto.color,
        priceCents: dto.priceCents,
        stretch: dto.stretch,
        fabricNotes: dto.fabricNotes,
        knownLimitations: dto.knownLimitations ?? [],
        photoKey,
        photoType: dto.photoType,
        sizeChart: { create: sizeRows(dto.sizeChart) },
      },
    });
    return { id };
  }

  /** Cambiar la foto invalida el recorte y las pruebas sobre modelos: mostraban la prenda anterior. */
  async replaceGarmentPhoto(id: string, photoType: unknown, file: Upload) {
    if (!PHOTO_TYPES.includes(photoType as GarmentPhotoType)) throw new BadRequestException('photoType inválido');
    const current = await this.prisma.garment.findUnique({ where: { id }, include: { previews: true } });
    if (!current) throw new NotFoundException();
    await this.storage.put(current.photoKey, await storePhoto(file), 'image/jpeg');
    const stale = [...current.previews.map((p) => p.imageKey), ...(current.cutoutKey ? [current.cutoutKey] : [])];
    await this.prisma.$transaction([
      this.prisma.bodyModelPreview.deleteMany({ where: { garmentId: id } }),
      this.prisma.garment.update({ where: { id }, data: { photoType: photoType as GarmentPhotoType, cutoutKey: null } }),
    ]);
    if (stale.length) await this.storage.deleteMany(stale);
    return { id };
  }

  async updateGarment(id: string, dto: GarmentPatchDto) {
    const current = await this.prisma.garment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException();
    await this.prisma.$transaction(async (tx) => {
      await tx.garment.update({
        where: { id },
        data: { name: dto.name, priceCents: dto.priceCents, active: dto.active, color: dto.color, fabricNotes: dto.fabricNotes },
      });
      if (dto.sizeChart) {
        await tx.sizeChartEntry.deleteMany({ where: { garmentId: id } });
        await tx.sizeChartEntry.createMany({ data: sizeRows(dto.sizeChart).map((r) => ({ ...r, garmentId: id })) });
      }
    });
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

  async createBodyModel(dto: BodyModelDto, file: Upload) {
    if (dto.heightMin > dto.heightMax) throw new ConflictException('rango de altura inválido');
    const id = randomUUID();
    const photoKey = `catalog/bodies/${id}/photo.jpg`;
    await this.storage.put(photoKey, await storePhoto(file), 'image/jpeg');
    const count = await this.prisma.bodyModel.count();
    await this.prisma.bodyModel.create({
      data: {
        id,
        bodyTypeTag: dto.bodyTypeTag,
        typicalSize: dto.typicalSize,
        heightMin: dto.heightMin,
        heightMax: dto.heightMax,
        skinTone: dto.skinTone,
        shape: {
          heightCm: Math.round((dto.heightMin + dto.heightMax) / 2),
          shoulderCm: dto.shoulderCm,
          chestCm: dto.chestCm,
          waistCm: dto.waistCm,
          hipCm: dto.hipCm,
        },
        photoKey,
        sortOrder: count,
      },
    });
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

}

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('garments') garments() { return this.admin.listGarments(); }
  @Post('garments')
  @UseInterceptors(photoUpload())
  createGarment(@Body('data') data: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.admin.createGarment(parseData(GarmentDto, data), file);
  }
  @Post('garments/describe')
  @HttpCode(200)
  @UseInterceptors(photoUpload())
  describeGarment(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.admin.describeGarment(file);
  }
  @Put('garments/:id/photo')
  @UseInterceptors(photoUpload())
  replaceGarmentPhoto(@Param('id', ParseUUIDPipe) id: string, @Body('photoType') photoType: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.admin.replaceGarmentPhoto(id, photoType, file);
  }
  @Patch('garments/:id') updateGarment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GarmentPatchDto) { return this.admin.updateGarment(id, dto); }
  @Get('brands') brands() { return this.admin.listBrands(); }
  @Post('brands') createBrand(@Body() dto: BrandDto) { return this.admin.createBrand(dto); }
  @Get('body-models') bodyModels() { return this.admin.listBodyModels(); }
  @Post('body-models')
  @UseInterceptors(photoUpload())
  createBodyModel(@Body('data') data: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.admin.createBodyModel(parseData(BodyModelDto, data), file);
  }
  @Delete('body-models/:id') deleteBodyModel(@Param('id', ParseUUIDPipe) id: string) { return this.admin.deleteBodyModel(id); }
  @Get('metrics') metrics(@Query() q: MetricsQuery) { return this.admin.metricsSummary(q.days); }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
