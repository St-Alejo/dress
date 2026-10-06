import { BadRequestException, Body, Controller, HttpCode, NotFoundException, Post, Res } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { BodyEstimator } from '@vestirse/fit-engine';
import type { Silhouette } from '@vestirse/shared-types';
import type { Response } from 'express';
import { PrismaService } from '../../../common/prisma.service';
import type { BodyShape } from '../infrastructure/illustration/body-geometry';
import type { GarmentArt, GarmentStyle, Pattern } from '../infrastructure/illustration/garment-art';
import { renderPreview } from '../infrastructure/illustration/renderer';

class ProfileDto {
  @IsNumber() @Min(120) @Max(230) heightCm: number;
  @IsOptional() @IsNumber() @Min(30) @Max(300) weightKg?: number;
  @IsOptional() @IsIn(['feminine', 'masculine', 'neutral']) silhouette?: Silhouette;
  @IsOptional() @IsNumber() @Min(50) @Max(200) chestCm?: number;
  @IsOptional() @IsNumber() @Min(40) @Max(200) waistCm?: number;
  @IsOptional() @IsNumber() @Min(50) @Max(200) hipCm?: number;
}

class ItemDto {
  @IsUUID() garmentId: string;
  @IsString() @MaxLength(10) size: string;
}

class FitPreviewDto {
  @ValidateNested() @Type(() => ProfileDto) profile: ProfileDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => ItemDto) items: ItemDto[];
}

const SHOULDER_RATIO: Record<Silhouette, number> = { feminine: 0.225, masculine: 0.245, neutral: 0.235 };
/** Maniquí neutro: la vista por talla muestra medidas, no a una persona. */
const MANNEQUIN = { skinTone: '#cdbfae', hair: 'none' as const, hairColor: '#000000' };

/**
 * "Medirse las prendas por talla" sin IA: un maniquí con las medidas de la persona
 * y las prendas dibujadas con sus medidas REALES en la talla elegida. Es exacto
 * dentro de lo que describen las tablas, instantáneo y gratis. Nada se guarda.
 */
@Controller('catalog')
export class FitPreviewController {
  private readonly estimator = new BodyEstimator();

  constructor(private readonly prisma: PrismaService) {}

  @Post('fit-preview')
  @HttpCode(200)
  async preview(@Body() dto: FitPreviewDto, @Res() res: Response) {
    const profile = dto.profile;
    // Sin peso ni medidas, se dibuja con una complexión media por estatura, y el cliente lo indica.
    // Las medidas con cinta siempre tienen prioridad dentro del estimador.
    const est = this.estimator.estimate({ ...profile, weightKg: profile.weightKg ?? 22 * (profile.heightCm / 100) ** 2 });
    const shape: BodyShape = {
      heightCm: profile.heightCm,
      shoulderCm: profile.heightCm * SHOULDER_RATIO[profile.silhouette ?? 'neutral'],
      chestCm: est.chestCm!,
      waistCm: est.waistCm!,
      hipCm: est.hipCm!,
    };

    const garments = await this.prisma.garment.findMany({
      where: { id: { in: dto.items.map((i) => i.garmentId) } },
      include: { sizeChart: true },
    });
    const arts: GarmentArt[] = dto.items.map((item) => {
      const g = garments.find((x) => x.id === item.garmentId);
      if (!g) throw new NotFoundException(`prenda ${item.garmentId}`);
      const entry = g.sizeChart.find((e) => e.size === item.size);
      if (!entry) throw new BadRequestException(`talla ${item.size} inexistente`);
      const dims = {
        chestCm: entry.gChest ?? undefined,
        waistCm: entry.gWaist ?? undefined,
        hipCm: entry.gHip ?? undefined,
        lengthCm: entry.gLength ?? undefined,
        sleeveCm: entry.gSleeve ?? undefined,
        inseamCm: entry.gInseam ?? undefined,
      };
      return { id: `${g.id}-${item.size}`, style: g.style as GarmentStyle, color: g.color, pattern: g.pattern as Pattern, dims };
    });

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.send(renderPreview({ shape, ...MANNEQUIN }, arts));
  }
}
