import { Body, Controller, Injectable, Module, NotFoundException, Post, UnprocessableEntityException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { BrandCalibration, FitEngine, SizeChart } from '@vestirse/fit-engine';
import type { FitRecommendation, GarmentCategory } from '@vestirse/shared-types';
import { PrismaService } from '../../common/prisma.service';
import { CurrentRequester, type Requester } from '../../common/requester';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogRepository } from '../catalog/application/catalog.repository';
import { MetricsService } from '../metrics/metrics.module';
import { TryOnSessionRepository } from '../tryon/application/tryon-session.repository';
import { TryOnSessionsPersistenceModule } from '../tryon/tryon-persistence.module';

/** Puerto de calibración por marca/categoría. */
export abstract class CalibrationRepository {
  abstract get(brandId: string, category: GarmentCategory): Promise<BrandCalibration>;
  abstract record(brandId: string, category: GarmentCategory, recommendedIndex: number, chosenIndex: number): Promise<void>;
}

@Injectable()
export class PrismaCalibrationRepository extends CalibrationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async get(brandId: string, category: GarmentCategory) {
    const row = await this.prisma.brandCalibration.findUnique({ where: { brandId_category: { brandId, category } } });
    return row ? new BrandCalibration(brandId, row.sampleSize, row.shiftSum) : BrandCalibration.empty(brandId);
  }

  async record(brandId: string, category: GarmentCategory, recommendedIndex: number, chosenIndex: number) {
    const shift = chosenIndex - recommendedIndex;
    await this.prisma.brandCalibration.upsert({
      where: { brandId_category: { brandId, category } },
      create: { brandId, category, sampleSize: 1, shiftSum: shift },
      update: { sampleSize: { increment: 1 }, shiftSum: { increment: shift } },
    });
  }
}

class MeasurementsDto {
  @IsNumber() @Min(120) @Max(230) heightCm: number;
  @IsOptional() @IsNumber() @Min(50) @Max(200) chestCm?: number;
  @IsOptional() @IsNumber() @Min(40) @Max(200) waistCm?: number;
  @IsOptional() @IsNumber() @Min(50) @Max(200) hipCm?: number;
  @IsOptional() @IsBoolean() estimatedFromPose?: boolean;
}

class PoseRatiosDto {
  @IsNumber() @Min(0.5) @Max(2.5) shoulderToHipRatio: number;
}

class EstimateFitDto {
  @IsUUID() garmentId: string;
  @ValidateNested() @Type(() => MeasurementsDto) measurements: MeasurementsDto;
  @IsOptional() @ValidateNested() @Type(() => PoseRatiosDto) poseRatios?: PoseRatiosDto;
  @IsOptional() @IsUUID() sessionId?: string;
}

class OverrideDto {
  @IsUUID() garmentId: string;
  @IsString() @MaxLength(10) recommendedSize: string;
  @IsString() @MaxLength(10) chosenSize: string;
  @IsOptional() @IsUUID() sessionId?: string;
}

@Injectable()
export class FitService {
  private readonly engine = new FitEngine();

  constructor(
    private readonly catalog: CatalogRepository,
    private readonly calibration: CalibrationRepository,
    private readonly sessions: TryOnSessionRepository,
    private readonly metrics: MetricsService,
  ) {}

  /** Caso de uso EstimateFit (Track C). Las medidas no se persisten: solo la recomendación. */
  async estimate(dto: EstimateFitDto, requester: Requester): Promise<FitRecommendation> {
    const garment = await this.catalog.findGarment(dto.garmentId);
    if (!garment) throw new NotFoundException();
    const rec = this.engine.recommend({
      measurements: dto.measurements,
      sizeChart: garment.sizeChart,
      category: garment.category,
      stretch: garment.stretch,
      poseRatios: dto.poseRatios,
      calibration: await this.calibration.get(garment.brandId, garment.category),
    });
    await this.metrics.record('size-recommended', { garmentId: garment.id, confidence: rec.confidence });
    if (dto.sessionId) await this.saveOnSession(dto.sessionId, requester, rec);
    return rec;
  }

  /** La persona corrige la talla: siempre se acepta y alimenta la calibración de la marca. */
  async override(dto: OverrideDto, requester: Requester): Promise<{ userOverride: string }> {
    const garment = await this.catalog.findGarment(dto.garmentId);
    if (!garment) throw new NotFoundException();
    const chart = new SizeChart(garment.sizeChart);
    if (!chart.has(dto.chosenSize) || !chart.has(dto.recommendedSize)) {
      throw new UnprocessableEntityException('talla inexistente para esta prenda');
    }
    if (dto.chosenSize !== dto.recommendedSize) {
      await this.calibration.record(garment.brandId, garment.category, chart.indexOf(dto.recommendedSize), chart.indexOf(dto.chosenSize));
      await this.metrics.record('size-overridden', {
        garmentId: garment.id,
        direction: chart.indexOf(dto.chosenSize) > chart.indexOf(dto.recommendedSize) ? 'up' : 'down',
      });
    }
    if (dto.sessionId) {
      const session = await this.sessions.findOwned(dto.sessionId, requester);
      if (session?.fitRecommendation) {
        await this.saveOnSession(dto.sessionId, requester, this.engine.applyOverride(session.fitRecommendation, dto.chosenSize, garment.sizeChart));
      }
    }
    return { userOverride: dto.chosenSize };
  }

  private async saveOnSession(sessionId: string, requester: Requester, rec: FitRecommendation) {
    const session = await this.sessions.findOwned(sessionId, requester);
    if (!session) return;
    session.setFitRecommendation(rec);
    await this.sessions.save(session);
  }
}

@Controller('fit')
export class FitController {
  constructor(private readonly fit: FitService) {}

  @Post('estimate')
  estimate(@Body() dto: EstimateFitDto, @CurrentRequester() requester: Requester) {
    return this.fit.estimate(dto, requester);
  }

  @Post('override')
  override(@Body() dto: OverrideDto, @CurrentRequester() requester: Requester) {
    return this.fit.override(dto, requester);
  }
}

@Module({
  imports: [CatalogModule, TryOnSessionsPersistenceModule],
  controllers: [FitController],
  providers: [FitService, { provide: CalibrationRepository, useClass: PrismaCalibrationRepository }],
})
export class FitModule {}
