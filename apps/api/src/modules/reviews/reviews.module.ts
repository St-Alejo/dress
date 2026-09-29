import { Body, Controller, Get, Injectable, Module, NotFoundException, Post, Query, UnprocessableEntityException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { FitFeeling, FitReview, FitReviewSummary, FitZone } from '@vestirse/shared-types';
import { fromDbFeeling, toDbFeeling } from '../../common/mappers';
import { PrismaService } from '../../common/prisma.service';
import { CurrentRequester, type Requester } from '../../common/requester';

const FEELINGS: FitFeeling[] = ['runs-small', 'true-to-size', 'runs-large'];
const ZONES: FitZone[] = ['shoulders', 'chest', 'waist', 'hips', 'length', 'sleeves'];

class CreateReviewDto {
  @IsUUID() garmentId: string;
  @IsString() @MaxLength(10) sizeBought: string;
  @IsIn(FEELINGS) feeling: FitFeeling;
  @IsArray() @ArrayMaxSize(6) @IsIn(ZONES, { each: true }) zones: FitZone[];
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

class ReviewQuery {
  @IsUUID() garmentId: string;
}

/** Reseñas de AJUSTE (no de estética): contexto que acompaña al resultado visual (paso 7). */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(garmentId: string): Promise<{ reviews: FitReview[]; summary: FitReviewSummary }> {
    const rows = await this.prisma.fitReview.findMany({ where: { garmentId }, orderBy: { createdAt: 'desc' }, take: 50 });
    const reviews: FitReview[] = rows.map((r) => ({
      id: r.id,
      garmentId: r.garmentId,
      sizeBought: r.sizeBought,
      feeling: fromDbFeeling(r.feeling),
      zones: r.zones as FitZone[],
      comment: r.comment ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }));
    return { reviews, summary: summarize(garmentId, reviews) };
  }

  async create(dto: CreateReviewDto, requester: Requester) {
    const sizes = await this.prisma.sizeChartEntry.findMany({ where: { garmentId: dto.garmentId }, select: { size: true } });
    if (sizes.length === 0) throw new NotFoundException();
    if (!sizes.some((s) => s.size === dto.sizeBought)) throw new UnprocessableEntityException('talla inexistente');
    await this.prisma.fitReview.create({
      data: {
        garmentId: dto.garmentId,
        userId: requester.userId,
        sizeBought: dto.sizeBought,
        feeling: toDbFeeling(dto.feeling),
        zones: [...new Set(dto.zones)],
        comment: dto.comment?.trim() || undefined,
      },
    });
    return this.list(dto.garmentId);
  }
}

export function summarize(garmentId: string, reviews: FitReview[]): FitReviewSummary {
  const zoneCount = new Map<FitZone, number>();
  for (const r of reviews) {
    if (r.feeling === 'true-to-size') continue;
    for (const z of r.zones) zoneCount.set(z, (zoneCount.get(z) ?? 0) + 1);
  }
  return {
    garmentId,
    total: reviews.length,
    runsSmall: reviews.filter((r) => r.feeling === 'runs-small').length,
    trueToSize: reviews.filter((r) => r.feeling === 'true-to-size').length,
    runsLarge: reviews.filter((r) => r.feeling === 'runs-large').length,
    topZones: [...zoneCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([z]) => z),
  };
}

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Query() q: ReviewQuery) {
    return this.reviews.list(q.garmentId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  create(@Body() dto: CreateReviewDto, @CurrentRequester() r: Requester) {
    return this.reviews.create(dto, r);
  }
}

@Module({ controllers: [ReviewsController], providers: [ReviewsService] })
export class ReviewsModule {}
