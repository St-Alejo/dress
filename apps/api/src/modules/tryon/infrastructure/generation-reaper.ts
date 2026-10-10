import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { MetricsService } from '../../metrics/metrics.module';
import { TryOnSessionRepository } from '../application/tryon-session.repository';
import { DEFAULT_GENERATION_TIMEOUT_SECONDS } from './ai-worker.adapter';
import { TryOnGateway } from './tryon.gateway';

/**
 * Rescata generaciones que nunca terminaron (el proceso murió a mitad, Redis
 * perdió el trabajo...). Sin esto la sesión quedaría en `processing` para siempre
 * y la persona no podría volver a intentarlo.
 */
@Injectable()
export class GenerationReaper {
  private readonly logger = new Logger(GenerationReaper.name);
  readonly maxMs: number;

  constructor(
    private readonly sessions: TryOnSessionRepository,
    private readonly gateway: TryOnGateway,
    private readonly metrics: MetricsService,
    config: ConfigService,
  ) {
    // Por defecto: el timeout de generación más un margen holgado para reintentos y cola.
    const timeoutS = Number(config.get('GENERATION_TIMEOUT_SECONDS', DEFAULT_GENERATION_TIMEOUT_SECONDS));
    this.maxMs = Number(config.get('GENERATION_STUCK_SECONDS', timeoutS * 2 + 120)) * 1000;
  }

  @Cron('*/2 * * * *')
  async scheduled() {
    const n = await this.reap(new Date());
    if (n) this.logger.warn(`${n} generación(es) atascada(s) marcadas como fallidas`);
  }

  async reap(now: Date): Promise<number> {
    const candidates = await this.sessions.findStuck(new Date(now.getTime() - this.maxMs), 100);
    let reaped = 0;
    for (const session of candidates) {
      if (!session.isStuck(now, this.maxMs)) continue;
      session.fail('stuck', now);
      await this.sessions.save(session);
      await this.metrics.record('generation-failed', { sessionId: session.id, reason: 'stuck', status: 'failed' });
      this.gateway.emit({ sessionId: session.id, status: 'failed', progress: 1, fallbackReason: 'stuck' });
      reaped++;
    }
    return reaped;
  }
}
