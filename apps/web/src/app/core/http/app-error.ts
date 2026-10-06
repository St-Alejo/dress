import { HttpErrorResponse } from '@angular/common/http';

/**
 * Error normalizado de la API. Toda la app trabaja con esta forma, nunca con
 * HttpErrorResponse: así los componentes no dependen de detalles de transporte.
 */
export class AppError extends Error {
  constructor(
    /** 0 = sin conexión / sin respuesta. */
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get isNetwork() { return this.status === 0; }
  get isServer() { return this.status >= 500; }
  get isTransient() { return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504; }

  static from(err: unknown): AppError {
    if (err instanceof AppError) return err;
    if (err instanceof HttpErrorResponse) {
      const body = (err.error ?? {}) as { code?: unknown; message?: unknown; requestId?: unknown };
      const requestId = typeof body.requestId === 'string' ? body.requestId : (err.headers?.get('X-Request-Id') ?? undefined);
      return new AppError(
        err.status,
        typeof body.code === 'string' ? body.code : err.status === 0 ? 'network' : 'http-' + err.status,
        typeof body.message === 'string' ? body.message : err.message,
        requestId,
      );
    }
    return new AppError(-1, 'client', err instanceof Error ? err.message : String(err));
  }
}
