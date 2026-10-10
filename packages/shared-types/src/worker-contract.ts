import type { GarmentCategory, GarmentPhotoType } from './index';

/**
 * Contrato v1 entre la API y el ai-worker. La fuente de verdad son los JSON Schema
 * de `contracts/ai-worker/v1/`; estos tipos los reflejan y ambos lados validan
 * contra los mismos fixtures en sus tests.
 */
export const WORKER_CONTRACT_VERSION = '1';

export interface WorkerGarment {
  index: number;
  category: GarmentCategory;
  name: string;
  color: string;
  /** Descriptor de ajuste en inglés (ver fit-brief.ts). */
  fit: string;
  /** Opcional: por defecto el worker asume `flat-lay`. */
  photoType?: GarmentPhotoType;
}

export interface WorkerManifest {
  contractVersion: typeof WORKER_CONTRACT_VERSION;
  requestId: string;
  garments: WorkerGarment[];
  /** Estatura y complexión en categorías gruesas, nunca números. */
  bodyBrief: string;
}

export type WorkerErrorCode =
  | 'bad-input'
  | 'unsupported'
  | 'unauthorized'
  | 'not-configured'
  | 'rate-limited'
  | 'content-policy'
  | 'provider-error'
  | 'timeout';

export interface WorkerErrorBody {
  code: WorkerErrorCode;
  detail: string;
  retryable: boolean;
}

/** Tabla única código ↔ status HTTP. El worker la usa para responder y la API para interpretar. */
export const WORKER_ERROR_STATUS: Record<WorkerErrorCode, number> = {
  'bad-input': 400,
  unauthorized: 401,
  'not-configured': 412,
  unsupported: 422,
  'rate-limited': 429,
  'content-policy': 451,
  'provider-error': 502,
  timeout: 504,
};

/** Solo estos fallos tienen sentido reintentarlos: el resto fallaría igual. */
export const RETRYABLE_WORKER_ERRORS: ReadonlySet<WorkerErrorCode> = new Set(['rate-limited', 'provider-error', 'timeout']);

export function workerErrorFromStatus(status: number): WorkerErrorCode {
  const found = (Object.entries(WORKER_ERROR_STATUS) as [WorkerErrorCode, number][]).find(([, s]) => s === status);
  return found ? found[0] : status >= 500 ? 'provider-error' : 'bad-input';
}

/** Cabeceras de la petición y la respuesta (nombres canónicos). */
export const WORKER_HEADERS = {
  provider: 'X-AI-Provider',
  model: 'X-AI-Model',
  key: 'X-AI-Key',
  requestId: 'X-Request-Id',
  token: 'X-Worker-Token',
  engine: 'X-Engine',
  durationMs: 'X-Duration-Ms',
} as const;
