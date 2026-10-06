import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { catchError, retry, throwError, timer } from 'rxjs';
import { AuthStore } from '../auth.store';
import { AppError } from './app-error';

const TRANSIENT = new Set([0, 502, 503, 504]);
export const RETRY_DELAYS_MS = [400, 1200];

/**
 * Interceptor único de errores HTTP:
 * - reintenta SOLO lecturas (GET) ante fallos transitorios, con espera creciente;
 * - si la sesión expiró (401), olvida al usuario en el cliente;
 * - entrega siempre un `AppError` con el requestId del servidor para rastrearlo.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);
  const retryable = req.method === 'GET';
  return next(req).pipe(
    retry({
      count: retryable ? RETRY_DELAYS_MS.length : 0,
      delay: (err, attempt) => {
        if (err instanceof HttpErrorResponse && TRANSIENT.has(err.status)) return timer(RETRY_DELAYS_MS[attempt - 1]);
        return throwError(() => err);
      },
    }),
    catchError((err: unknown) => {
      // Lazy: AuthStore depende de ApiService → HttpClient → este interceptor.
      if (err instanceof HttpErrorResponse && err.status === 401 && !req.url.includes('/auth/')) {
        injector.get(AuthStore).user.set(null);
      }
      return throwError(() => AppError.from(err));
    }),
  );
};
