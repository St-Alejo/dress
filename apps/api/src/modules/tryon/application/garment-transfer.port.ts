import type { GarmentCategory } from '@vestirse/shared-types';

export interface TransferResult {
  image: Buffer;
  engine: string;
  durationMs: number;
}

export class TransferUnavailableError extends Error {
  constructor(readonly reason: 'timeout' | 'circuit-open' | 'unsupported' | 'provider-error') {
    super(reason);
  }
}

/** Puerto hacia el proveedor de inferencia de difusión (Adapter, sección 10). */
export abstract class GarmentTransferPort {
  abstract generate(person: Buffer, garment: Buffer, category: GarmentCategory): Promise<TransferResult>;
}
