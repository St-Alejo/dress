import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../auth.store';
import { AppError } from './app-error';
import { RETRY_DELAYS_MS, errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  const auth = { user: { set: vi.fn() } };

  beforeEach(() => {
    vi.useFakeTimers();
    auth.user.set.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    ctrl.verify();
    vi.useRealTimers();
  });

  it('reintenta un GET ante 503 y entrega la respuesta si luego funciona', async () => {
    const result = firstValueFrom(http.get<{ ok: boolean }>('/api/x'));
    ctrl.expectOne('/api/x').flush(null, { status: 503, statusText: 'Unavailable' });
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    ctrl.expectOne('/api/x').flush({ ok: true });
    await expect(result).resolves.toEqual({ ok: true });
  });

  it('no reintenta escrituras (POST): podrían duplicar efectos', async () => {
    const result = firstValueFrom(http.post('/api/x', {}));
    ctrl.expectOne('/api/x').flush(null, { status: 503, statusText: 'Unavailable' });
    await expect(result).rejects.toBeInstanceOf(AppError);
    await vi.advanceTimersByTimeAsync(5000);
    ctrl.expectNone('/api/x');
  });

  it('no reintenta errores del cliente (4xx) y normaliza el cuerpo de la API', async () => {
    const result = firstValueFrom(http.get('/api/x'));
    ctrl.expectOne('/api/x').flush({ statusCode: 409, code: 'conflict', message: 'ya en curso', requestId: 'req-1' }, { status: 409, statusText: 'Conflict' });
    const err = await result.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 409, code: 'conflict', message: 'ya en curso', requestId: 'req-1' });
  });

  it('se rinde tras agotar los reintentos', async () => {
    const result = firstValueFrom(http.get('/api/x')).catch((e: unknown) => e);
    ctrl.expectOne('/api/x').flush(null, { status: 502, statusText: 'Bad Gateway' });
    for (const delay of RETRY_DELAYS_MS) {
      await vi.advanceTimersByTimeAsync(delay);
      ctrl.expectOne('/api/x').flush(null, { status: 502, statusText: 'Bad Gateway' });
    }
    expect(await result).toMatchObject({ status: 502, isServer: true });
  });

  it('un 401 fuera de /auth olvida al usuario en el cliente', async () => {
    const result = firstValueFrom(http.get('/api/tryon/sessions')).catch(() => undefined);
    ctrl.expectOne('/api/tryon/sessions').flush(null, { status: 401, statusText: 'Unauthorized' });
    await result;
    expect(auth.user.set).toHaveBeenCalledWith(null);
  });

  it('un 401 de /auth/login (credenciales malas) no toca el estado', async () => {
    const result = firstValueFrom(http.post('/api/auth/login', {})).catch(() => undefined);
    ctrl.expectOne('/api/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });
    await result;
    expect(auth.user.set).not.toHaveBeenCalled();
  });
});
