/**
 * Espera exponencial con tope: 2 s, 3 s, 4.5 s, ... hasta `maxMs`.
 * Función pura para poder probarla sin temporizadores.
 */
export function backoffDelay(attempt: number, { baseMs = 2000, factor = 1.5, maxMs = 15000 } = {}): number {
  return Math.min(maxMs, Math.round(baseMs * factor ** Math.max(0, attempt)));
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });
}
