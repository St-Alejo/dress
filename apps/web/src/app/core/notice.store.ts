import { Injectable, signal } from '@angular/core';
import { AppError } from './http/app-error';

export type NoticeKind = 'error' | 'success' | 'info';

export interface Notice {
  id: number;
  kind: NoticeKind;
  /** Clave i18n. */
  key: string;
  /** Referencia para soporte (requestId del servidor). */
  ref?: string;
}

const AUTO_DISMISS_MS: Record<NoticeKind, number> = { success: 4000, info: 6000, error: 9000 };

/**
 * Avisos globales (región aria-live). Sustituye los errores tragados en silencio:
 * cualquier acción que falle llama a `error(err, 'clave.de.contexto')`.
 */
@Injectable({ providedIn: 'root' })
export class NoticeStore {
  readonly notices = signal<Notice[]>([]);
  private seq = 0;

  push(kind: NoticeKind, key: string, ref?: string): number {
    const id = ++this.seq;
    // Sin duplicados visibles: el mismo aviso repetido reemplaza al anterior.
    this.notices.update((list) => [...list.filter((n) => !(n.kind === kind && n.key === key)), { id, kind, key, ref }].slice(-3));
    setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS[kind]);
    return id;
  }

  success(key: string) { return this.push('success', key); }
  info(key: string) { return this.push('info', key); }

  /** Elige el mensaje según la causa; `contextKey` describe qué estaba intentando la persona. */
  error(err: unknown, contextKey = 'errors.generic') {
    const e = AppError.from(err);
    const key = e.isNetwork ? 'errors.network' : e.status === 429 ? 'errors.rateLimited' : e.isServer ? 'errors.server' : contextKey;
    return this.push('error', key, e.requestId);
  }

  dismiss(id: number) {
    this.notices.update((list) => list.filter((n) => n.id !== id));
  }
}
