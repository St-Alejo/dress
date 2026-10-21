import { Injectable, signal } from '@angular/core';
import { localPrefs } from './local-prefs';

/** Un look guardado: solo ids de prendas y del modelo, nunca fotos ni medidas. */
export interface SavedLook {
  id: string;
  garmentIds: string[];
  bodyId: string | null;
  createdAt: number;
}

const KEY = 'looks';
export const MAX_LOOKS = 24;

/**
 * Looks guardados en este navegador. No hace falta cuenta y no sale nada del dispositivo;
 * para pasarlos a otra persona o a otro equipo está el enlace (`/look?prendas=…&modelo=…`).
 */
@Injectable({ providedIn: 'root' })
export class LookStore {
  readonly looks = signal<SavedLook[]>(localPrefs.read<SavedLook[]>(KEY, []).filter(isLook));

  /** Guarda el look (si ya existe el mismo, lo sube al principio en vez de repetirlo). */
  save(garmentIds: string[], bodyId: string | null, now = Date.now()): SavedLook | null {
    if (!garmentIds.length) return null;
    const same = (l: SavedLook) => sameSet(l.garmentIds, garmentIds) && l.bodyId === bodyId;
    const look: SavedLook = { id: this.looks().find(same)?.id ?? `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, garmentIds, bodyId, createdAt: now };
    this.persist([look, ...this.looks().filter((l) => !same(l))].slice(0, MAX_LOOKS));
    return look;
  }

  remove(id: string): void {
    this.persist(this.looks().filter((l) => l.id !== id));
  }

  clear(): void {
    this.looks.set([]);
    localPrefs.remove(KEY);
  }

  private persist(looks: SavedLook[]) {
    this.looks.set(looks);
    localPrefs.write(KEY, looks);
  }
}

/** Ruta y parámetros para abrir un look (sirve para compartirlo por enlace). */
export function lookQuery(garmentIds: string[], bodyId: string | null): Record<string, string> {
  return { prendas: garmentIds.join(','), ...(bodyId ? { modelo: bodyId } : {}) };
}

/** Lee `prendas=a,b,c` sin aceptar basura: solo ids con forma razonable y sin repetir. */
export function parseLookIds(raw: string | null | undefined): string[] {
  const ids = (raw ?? '').split(',').map((s) => s.trim()).filter((s) => /^[\w-]{1,64}$/.test(s));
  return [...new Set(ids)].slice(0, 8);
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function isLook(x: unknown): x is SavedLook {
  const l = x as SavedLook;
  return !!l && typeof l.id === 'string' && Array.isArray(l.garmentIds) && typeof l.createdAt === 'number';
}
