import type { GarmentCategory, WorkerErrorCode } from '@vestirse/shared-types';
import type { AiCredentials } from '../../ai-settings/ai-settings.module';

export interface TransferResult {
  image: Buffer;
  engine: string;
  durationMs: number;
}

/** Códigos del contrato del worker más el estado del circuit breaker local. */
export type TransferFailure = WorkerErrorCode | 'circuit-open';

export class TransferUnavailableError extends Error {
  constructor(
    readonly reason: TransferFailure,
    /** true = vale la pena reintentar (BullMQ lo hará con backoff). */
    readonly retryable: boolean,
  ) {
    super(reason);
  }
}

export interface TransferGarment {
  image: Buffer;
  mime: string;
  category: GarmentCategory;
  name: string;
  color: string;
  /** Descriptor de ajuste derivado del análisis por talla (ver fit-brief.ts). */
  fit: string;
}

export interface TransferRequest {
  /** Correlación de extremo a extremo (logs de la API y del worker). */
  requestId: string;
  person: Buffer;
  /** Conjunto completo: una o varias prendas. */
  garments: TransferGarment[];
  /** Estatura y complexión en categorías gruesas, sin números. */
  bodyBrief: string;
  credentials: AiCredentials;
}

/** Puerto hacia el proveedor de inferencia (Adapter, sección 10). */
export abstract class GarmentTransferPort {
  abstract generate(req: TransferRequest): Promise<TransferResult>;
}
