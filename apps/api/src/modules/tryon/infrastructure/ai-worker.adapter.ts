import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import CircuitBreaker from 'opossum';
import type { GarmentCategory } from '@vestirse/shared-types';
import { GarmentTransferPort, TransferUnavailableError, type TransferResult } from '../application/garment-transfer.port';

class UnsupportedError extends Error {}

/**
 * Adapter HTTP al microservicio Python, envuelto en un Circuit Breaker:
 * si el proveedor tarda o falla repetidamente, se abre el circuito y se
 * responde de inmediato con fallback en vez de dejar a la persona esperando.
 */
@Injectable()
export class AiWorkerAdapter extends GarmentTransferPort {
  private readonly logger = new Logger(AiWorkerAdapter.name);
  private readonly baseUrl: string;
  private readonly breaker: CircuitBreaker<[Buffer, Buffer, GarmentCategory], TransferResult>;

  constructor(config: ConfigService) {
    super();
    this.baseUrl = config.getOrThrow<string>('AI_WORKER_URL');
    const timeoutMs = Number(config.get('GENERATION_TIMEOUT_SECONDS', 90)) * 1000;
    this.breaker = new CircuitBreaker((p: Buffer, g: Buffer, c: GarmentCategory) => this.call(p, g, c, timeoutMs), {
      timeout: timeoutMs,
      errorThresholdPercentage: 50,
      volumeThreshold: 3,
      resetTimeout: 30_000,
      // Una categoría no soportada no es una falla del proveedor: no debe abrir el circuito.
      errorFilter: (err: Error) => err instanceof UnsupportedError,
    });
    this.breaker.on('open', () => this.logger.warn('circuito de generación ABIERTO: se usará fallback'));
    this.breaker.on('close', () => this.logger.log('circuito de generación cerrado'));
  }

  async generate(person: Buffer, garment: Buffer, category: GarmentCategory): Promise<TransferResult> {
    try {
      return await this.breaker.fire(person, garment, category);
    } catch (err) {
      if (err instanceof UnsupportedError) throw new TransferUnavailableError('unsupported');
      if (this.breaker.opened) throw new TransferUnavailableError('circuit-open');
      if ((err as { code?: string }).code === 'ETIMEDOUT') throw new TransferUnavailableError('timeout');
      throw new TransferUnavailableError('provider-error');
    }
  }

  private async call(person: Buffer, garment: Buffer, category: GarmentCategory, timeoutMs: number): Promise<TransferResult> {
    const form = new FormData();
    form.append('person_image', new Blob([new Uint8Array(person)], { type: 'image/jpeg' }), 'person.jpg');
    form.append('garment_image', new Blob([new Uint8Array(garment)], { type: 'image/png' }), 'garment.png');
    form.append('category', category);
    const res = await fetch(`${this.baseUrl}/generate`, { method: 'POST', body: form, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 422) throw new UnsupportedError();
    if (!res.ok) throw new Error(`ai-worker respondió ${res.status}`);
    return {
      image: Buffer.from(await res.arrayBuffer()),
      engine: res.headers.get('x-engine') ?? 'unknown',
      durationMs: Number(res.headers.get('x-duration-ms') ?? 0),
    };
  }
}
