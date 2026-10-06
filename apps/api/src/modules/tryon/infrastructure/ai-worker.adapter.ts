import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import CircuitBreaker from 'opossum';
import {
  RETRYABLE_WORKER_ERRORS,
  WORKER_CONTRACT_VERSION,
  WORKER_HEADERS,
  workerErrorFromStatus,
  type WorkerErrorBody,
  type WorkerErrorCode,
  type WorkerManifest,
} from '@vestirse/shared-types';
import { workerHeaders } from '../../ai-settings/ai-settings.module';
import { GarmentTransferPort, TransferUnavailableError, type TransferRequest, type TransferResult } from '../application/garment-transfer.port';

/** Respuesta de error del worker ya interpretada según el contrato v1. */
export class WorkerCallError extends Error {
  constructor(
    readonly code: WorkerErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

/** Interpreta un cuerpo de error del worker; si no respeta el contrato, se deduce del status. */
export function parseWorkerError(status: number, body: unknown): WorkerCallError {
  const b = body as Partial<WorkerErrorBody> | null;
  const code = b && typeof b.code === 'string' ? (b.code as WorkerErrorCode) : workerErrorFromStatus(status);
  const retryable = typeof b?.retryable === 'boolean' ? b.retryable : RETRYABLE_WORKER_ERRORS.has(code);
  return new WorkerCallError(code, retryable);
}

/** Manifest v1: solo descriptores; las imágenes viajan aparte en el mismo orden. */
export function buildManifest(req: TransferRequest): WorkerManifest {
  return {
    contractVersion: WORKER_CONTRACT_VERSION,
    requestId: req.requestId,
    garments: req.garments.map(({ category, name, color, fit }, index) => ({ index, category, name, color, fit })),
    bodyBrief: req.bodyBrief,
  };
}

/**
 * Adapter HTTP al microservicio Python, con un Circuit Breaker POR PROVEEDOR:
 * si FASHN se cae, Gemini (o el mock) sigue funcionando. Si el proveedor tarda o
 * falla repetidamente, se abre su circuito y se responde de inmediato con
 * fallback en vez de dejar a la persona esperando.
 */
@Injectable()
export class AiWorkerAdapter extends GarmentTransferPort {
  private readonly logger = new Logger(AiWorkerAdapter.name);
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly timeoutMs: number;
  private readonly breakers = new Map<string, CircuitBreaker<[TransferRequest], TransferResult>>();

  constructor(config: ConfigService) {
    super();
    this.baseUrl = config.getOrThrow<string>('AI_WORKER_URL');
    this.token = config.get<string>('WORKER_TOKEN') || undefined;
    this.timeoutMs = Number(config.get('GENERATION_TIMEOUT_SECONDS', 90)) * 1000;
  }

  async generate(req: TransferRequest): Promise<TransferResult> {
    const breaker = this.breakerFor(req.credentials.provider);
    try {
      return await breaker.fire(req);
    } catch (err) {
      throw AiWorkerAdapter.classify(err);
    }
  }

  /** Orden importa: primero lo que dijo el worker, luego timeouts, y al final el estado del circuito. */
  static classify(err: unknown): TransferUnavailableError {
    if (err instanceof WorkerCallError) return new TransferUnavailableError(err.code, err.retryable);
    const e = err as { name?: string; code?: string };
    if (e?.name === 'TimeoutError' || e?.code === 'ETIMEDOUT') return new TransferUnavailableError('timeout', true);
    if (e?.code === 'EOPENBREAKER') return new TransferUnavailableError('circuit-open', false);
    // Worker caído o red interna (ECONNREFUSED, fetch failed): transitorio.
    return new TransferUnavailableError('provider-error', true);
  }

  private breakerFor(provider: string) {
    let breaker = this.breakers.get(provider);
    if (!breaker) {
      breaker = new CircuitBreaker((req: TransferRequest) => this.call(req), {
        // El abort del fetch dispara primero; el del breaker es solo una red de seguridad.
        timeout: this.timeoutMs + 2_000,
        errorThresholdPercentage: 50,
        volumeThreshold: 3,
        resetTimeout: 30_000,
        // Errores de la petición o de configuración no son fallas del proveedor: no abren el circuito.
        errorFilter: (err: Error) => err instanceof WorkerCallError && !err.retryable,
      });
      breaker.on('open', () => this.logger.warn(`circuito de generación ABIERTO para ${provider}: se usará fallback`));
      breaker.on('close', () => this.logger.log(`circuito de generación cerrado para ${provider}`));
      this.breakers.set(provider, breaker);
    }
    return breaker;
  }

  private async call(req: TransferRequest): Promise<TransferResult> {
    const manifest = buildManifest(req);
    const form = new FormData();
    form.append('person_image', new Blob([new Uint8Array(req.person)], { type: 'image/jpeg' }), 'person.jpg');
    req.garments.forEach((g, i) =>
      form.append('garment_images', new Blob([new Uint8Array(g.image)], { type: g.mime }), `garment-${i}.${g.mime === 'image/png' ? 'png' : 'jpg'}`),
    );
    form.append('manifest', JSON.stringify(manifest));

    const res = await fetch(`${this.baseUrl}/v1/generate`, {
      method: 'POST',
      body: form,
      headers: workerHeaders(req.credentials, { token: this.token, requestId: req.requestId }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw parseWorkerError(res.status, await res.json().catch(() => null));
    return {
      image: Buffer.from(await res.arrayBuffer()),
      engine: res.headers.get(WORKER_HEADERS.engine) ?? 'unknown',
      durationMs: Number(res.headers.get(WORKER_HEADERS.durationMs) ?? 0),
    };
  }
}
