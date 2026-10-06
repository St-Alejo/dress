import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay } from './http/backoff';
import { AppError } from './http/app-error';
import { NoticeStore } from './notice.store';

describe('NoticeStore', () => {
  let store: NoticeStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new NoticeStore();
  });
  afterEach(() => vi.useRealTimers());

  it('elige el mensaje según la causa, no según el contexto, para fallos de red y servidor', () => {
    store.error(new AppError(0, 'network', 'x'), 'errors.generate');
    store.error(new AppError(503, 'unavailable', 'x', 'req-9'), 'errors.load');
    store.error(new AppError(409, 'conflict', 'x'), 'errors.generate');
    expect(store.notices().map((n) => n.key)).toEqual(['errors.network', 'errors.server', 'errors.generate']);
    expect(store.notices()[1].ref).toBe('req-9');
  });

  it('no apila el mismo aviso dos veces y muestra como máximo tres', () => {
    store.success('photo.saved');
    store.success('photo.saved');
    expect(store.notices()).toHaveLength(1);
    ['a', 'b', 'c', 'd'].forEach((k) => store.info(k));
    expect(store.notices().map((n) => n.key)).toEqual(['b', 'c', 'd']);
  });

  it('los avisos se cierran solos; los errores duran más', () => {
    store.success('ok');
    store.error(new AppError(409, 'conflict', 'x'), 'errors.generic');
    vi.advanceTimersByTime(4500);
    expect(store.notices().map((n) => n.kind)).toEqual(['error']);
    vi.advanceTimersByTime(5000);
    expect(store.notices()).toEqual([]);
  });
});

describe('backoffDelay', () => {
  it('crece de forma exponencial y respeta el tope', () => {
    expect([0, 1, 2, 3].map((a) => backoffDelay(a))).toEqual([2000, 3000, 4500, 6750]);
    expect(backoffDelay(50)).toBe(15000);
  });
});
