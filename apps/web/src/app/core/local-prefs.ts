/**
 * Preferencias por navegador (idioma, cuerpo similar elegido, comparación).
 * localStorage puede no existir o fallar (modo privado): nunca debe romper la app.
 * Las medidas corporales solo se guardan si la persona lo pide explícitamente.
 */
export const localPrefs = {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = globalThis.localStorage?.getItem(`vestirse:${key}`);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  write(key: string, value: unknown): void {
    try {
      globalThis.localStorage?.setItem(`vestirse:${key}`, JSON.stringify(value));
    } catch {
      /* sin almacenamiento: la preferencia vive solo en memoria */
    }
  },
  remove(key: string): void {
    try {
      globalThis.localStorage?.removeItem(`vestirse:${key}`);
    } catch {
      /* noop */
    }
  },
};

/**
 * Igual que `localPrefs`, pero en sessionStorage: dura lo que la pestaña. Se usa
 * para recordar los ids de sesión de prueba al recargar (nunca la foto ni medidas).
 */
export const tabPrefs = {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = globalThis.sessionStorage?.getItem(`vestirse:${key}`);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  write(key: string, value: unknown): void {
    try {
      globalThis.sessionStorage?.setItem(`vestirse:${key}`, JSON.stringify(value));
    } catch {
      /* noop */
    }
  },
};
