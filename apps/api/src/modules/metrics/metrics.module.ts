import { Body, Controller, Global, Injectable, Module, Post } from '@nestjs/common';
import { IsIn, IsInt, IsUUID, Max, Min } from 'class-validator';
import type { MetricEventType, MetricsSummary, TryOnMode } from '@vestirse/shared-types';
import { PrismaService } from '../../common/prisma.service';

/**
 * Métricas de la sección 14. Deliberadamente NO existe una métrica de
 * "tiempo mirando el propio cuerpo": sería optimizar lo equivocado.
 */
@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(type: MetricEventType, payload: Record<string, string | number | boolean>) {
    await this.prisma.metricEvent.create({ data: { type, payload } });
  }

  async summary(since?: Date): Promise<MetricsSummary> {
    const where = since ? { createdAt: { gte: since } } : {};
    const grouped = await this.prisma.metricEvent.groupBy({ by: ['type'], where, _count: true });
    const count = (t: MetricEventType) => grouped.find((g) => g.type === t)?._count ?? 0;

    const modes = await this.prisma.$queryRaw<{ mode: string; n: bigint }[]>`
      SELECT payload->>'mode' AS mode, COUNT(*) AS n FROM "MetricEvent"
      WHERE type = 'mode-used' AND (${since ?? null}::timestamp IS NULL OR "createdAt" >= ${since ?? null}::timestamp)
      GROUP BY 1`;
    const modeDistribution: Record<TryOnMode, number> = { 'similar-model': 0, 'live-overlay': 0, photorealistic: 0 };
    for (const m of modes) if (m.mode in modeDistribution) modeDistribution[m.mode as TryOnMode] = Number(m.n);

    const [gen] = await this.prisma.$queryRaw<{ real: number | null; perceived: number | null }[]>`
      SELECT AVG((payload->>'durationMs')::float) AS real, AVG((payload->>'perceivedMs')::float) AS perceived
      FROM "MetricEvent" WHERE type = 'generation-completed'
      AND (${since ?? null}::timestamp IS NULL OR "createdAt" >= ${since ?? null}::timestamp)`;

    const recommendations = count('size-recommended');
    const overrides = count('size-overridden');
    return {
      modeDistribution,
      recommendations,
      overrides,
      overrideRate: recommendations ? overrides / recommendations : 0,
      avgGenerationMs: gen?.real ?? null,
      avgPerceivedMs: gen?.perceived ?? null,
      generationFailures: count('generation-failed'),
    };
  }
}

class ModeUsedDto {
  @IsIn(['similar-model', 'live-overlay', 'photorealistic']) mode: TryOnMode;
  @IsUUID() garmentId: string;
}

class PerceivedDto {
  @IsUUID() sessionId: string;
  @IsInt() @Min(0) @Max(600000) perceivedMs: number;
}

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Post('mode-used')
  async modeUsed(@Body() dto: ModeUsedDto) {
    await this.metrics.record('mode-used', { mode: dto.mode, garmentId: dto.garmentId });
    return { ok: true };
  }

  /** Tiempo percibido por el usuario en Track B (desde que pulsó "generar" hasta ver el resultado). */
  @Post('generation-perceived')
  async perceived(@Body() dto: PerceivedDto) {
    await this.metrics.record('generation-completed', { sessionId: dto.sessionId, perceivedMs: dto.perceivedMs });
    return { ok: true };
  }
}

@Global()
@Module({ controllers: [MetricsController], providers: [MetricsService], exports: [MetricsService] })
export class MetricsModule {}
