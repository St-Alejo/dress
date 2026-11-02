/**
 * Qué decir y qué ofrecer cuando la prueba con IA no termina, según el motivo que da el
 * servidor. Reintentar solo se ofrece cuando puede funcionar: con la cuota del día agotada,
 * sin motor configurado o sin foto, el botón solo haría esperar a la persona para nada.
 */
export interface FailureCopy {
  /** Clave i18n del texto explicativo. */
  body: string;
  canRetry: boolean;
}

const FAILED: Record<string, FailureCopy> = {
  'no-photo': { body: 'photo.failed.missingPhoto', canRetry: false },
  'missing-input': { body: 'photo.failed.missingPhoto', canRetry: false },
};

const FALLBACK: Record<string, FailureCopy> = {
  'rate-limited': { body: 'photo.fallback.quota', canRetry: false },
  'not-configured': { body: 'photo.fallback.notConfigured', canRetry: false },
  'content-policy': { body: 'photo.fallback.contentPolicy', canRetry: false },
  'circuit-open': { body: 'photo.fallback.busy', canRetry: true },
  timeout: { body: 'photo.fallback.timeout', canRetry: true },
};

export function failureCopy(status: 'failed' | 'fallback', reason: string | undefined): FailureCopy {
  const table = status === 'failed' ? FAILED : FALLBACK;
  return (reason && table[reason]) || { body: `photo.${status}.body`, canRetry: true };
}
