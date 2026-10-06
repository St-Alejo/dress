import { InjectQueue } from '@nestjs/bullmq';
import { BullModule } from '@nestjs/bullmq';
import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheck, HealthCheckService, HealthIndicatorService, PrismaHealthIndicator, TerminusModule } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { GENERATION_QUEUE } from '../tryon/application/tryon.service';

@Injectable()
export class DependencyIndicators {
  private readonly workerUrl: string;

  constructor(
    private readonly indicators: HealthIndicatorService,
    @InjectQueue(GENERATION_QUEUE) private readonly queue: Queue,
    config: ConfigService,
  ) {
    this.workerUrl = config.getOrThrow('AI_WORKER_URL');
  }

  /** Redis es crítico: sin él no hay cola de generación. */
  redis() {
    return this.indicators
      .check('redis')
      // Leer los contadores de la cola ejercita la conexión real y además informa la carga.
      .attempt(async () => this.queue.getJobCounts('waiting', 'active', 'failed'))
      .withTimeout(1500);
  }

  /**
   * El worker NO es crítico: sin él la app sigue funcionando con el modelo
   * similar y el overlay (fallback). Si no responde, el estado es `degraded` (200).
   */
  async worker() {
    const session = this.indicators.check('aiWorker');
    try {
      const res = await fetch(`${this.workerUrl}/health`, { signal: AbortSignal.timeout(1500) });
      const body = (await res.json()) as { contractVersion?: string; providers?: string[] };
      return res.ok ? session.up({ contractVersion: body.contractVersion, providers: body.providers }) : session.degraded({ httpStatus: res.status });
    } catch {
      return session.degraded({ message: 'no responde: se usará el fallback' });
    }
  }
}

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly deps: DependencyIndicators,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma, { timeout: 1500 }),
      () => this.deps.redis(),
      () => this.deps.worker(),
    ]);
  }
}

@Module({
  imports: [TerminusModule, BullModule.registerQueue({ name: GENERATION_QUEUE })],
  controllers: [HealthController],
  providers: [DependencyIndicators],
})
export class HealthModule {}
