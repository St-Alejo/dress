import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import { ObjectStorage } from '../../../common/storage';
import { CatalogRepository } from '../../catalog/application/catalog.repository';
import { MetricsService } from '../../metrics/metrics.module';
import { GarmentTransferPort, TransferUnavailableError } from '../application/garment-transfer.port';
import { TryOnSessionRepository } from '../application/tryon-session.repository';
import { GENERATION_QUEUE, type GenerationJob } from '../application/tryon.service';
import { TryOnGateway } from './tryon.gateway';

/** Caso de uso GenerateTryOn, ejecutado fuera del ciclo de la petición (Track B es lento). */
@Processor(GENERATION_QUEUE, { concurrency: 2 })
export class GenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerationProcessor.name);

  constructor(
    private readonly sessions: TryOnSessionRepository,
    private readonly catalog: CatalogRepository,
    private readonly storage: ObjectStorage,
    private readonly transfer: GarmentTransferPort,
    private readonly gateway: TryOnGateway,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<GenerationJob>) {
    const session = await this.sessions.findById(job.data.sessionId);
    if (!session || !session.photoKey) return;
    const sessionId = session.id;

    session.markProcessing();
    await this.sessions.save(session);
    this.gateway.emit({ sessionId, status: 'processing', progress: 0.1 });

    const garment = await this.catalog.findGarment(session.garmentId);
    const keys = await this.catalog.garmentImageKeys(session.garmentId);
    const [person, garmentSvg] = await Promise.all([
      this.storage.getBuffer(session.photoKey),
      keys ? this.storage.getBuffer(keys.flat) : null,
    ]);
    if (!garment || !person || !garmentSvg) return this.fallback(sessionId, 'missing-input');

    try {
      const garmentPng = await sharp(garmentSvg, { density: 150 }).png().toBuffer();
      const result = await this.transfer.generate(person, garmentPng, garment.category);
      // Re-leer: la persona pudo borrar la foto mientras se generaba; en ese caso se descarta el resultado.
      const current = await this.sessions.findById(sessionId);
      if (!current || !current.photoKey) return;
      current.complete();
      await this.storage.put(current.resultKey!, result.image, 'image/png');
      await this.sessions.save(current);
      await this.metrics.record('generation-completed', { sessionId, durationMs: result.durationMs, engine: result.engine });
      this.gateway.emit({ sessionId, status: 'done', progress: 1, resultImageUrl: current.toDto().resultImageUrl });
    } catch (err) {
      const reason = err instanceof TransferUnavailableError ? err.reason : 'provider-error';
      this.logger.warn(`generación ${sessionId} sin éxito: ${reason}`);
      await this.fallback(sessionId, reason);
    }
  }

  private async fallback(sessionId: string, reason: string) {
    const session = await this.sessions.findById(sessionId);
    if (session) {
      session.fallback();
      await this.sessions.save(session);
    }
    await this.metrics.record('generation-failed', { sessionId, reason });
    this.gateway.emit({ sessionId, status: 'fallback', progress: 1, fallbackReason: reason });
  }
}
