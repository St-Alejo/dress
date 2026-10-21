import type { GarmentCategory, GarmentItem } from '@vestirse/shared-types';

/**
 * "Combina con": reglas fijas de color y estilo, sin IA. Dada una prenda (o un look a medio
 * armar) puntúa el resto del catálogo de 0 a 1. Es una sugerencia, nunca una obligación.
 */

/** Huecos de un look, en el orden en que se eligen. Un vestido ocupa arriba y abajo a la vez. */
export type LookSlot = 'top' | 'bottom' | 'outerwear' | 'footwear' | 'accessory';
export const LOOK_SLOTS: LookSlot[] = ['top', 'bottom', 'outerwear', 'footwear', 'accessory'];

export function slotOf(category: GarmentCategory): LookSlot {
  return category === 'dress' ? 'top' : category;
}

/** Formalidad aproximada por estilo: 0 casual, 1 intermedio, 2 de vestir. */
const FORMALITY: Record<string, number> = {
  tshirt: 0, hoodie: 0, jeans: 0, shorts: 0, sneakers: 0, cap: 0,
  sweater: 1, skirt: 1, 'dress-a': 1, 'dress-wrap': 1, jacket: 1, boots: 1, bag: 1, scarf: 1,
  shirt: 2, trousers: 2, coat: 2,
};

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x808080;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** Blanco, negro, grises, beiges y el azul de un vaquero apagado combinan con todo. */
export function isNeutral({ h, s, l }: Hsl): boolean {
  const denim = h >= 195 && h <= 240 && s < 0.45 && l < 0.6;
  return s < 0.22 || l > 0.9 || l < 0.15 || denim;
}

/** Armonía de dos colores (0..1): neutros, tono sobre tono, análogos o complementarios suman. */
export function colorHarmony(a: string, b: string): number {
  const ca = hexToHsl(a);
  const cb = hexToHsl(b);
  if (isNeutral(ca) || isNeutral(cb)) return 1;
  const diff = Math.min(Math.abs(ca.h - cb.h), 360 - Math.abs(ca.h - cb.h));
  if (diff <= 20) return 0.85; // tono sobre tono
  if (diff <= 50) return 0.7; // análogos
  if (diff >= 150) return 0.75; // complementarios
  return 0.3; // dos colores vivos que se pelean
}

/** Cercanía de estilo (0..1): un buzo con un abrigo de vestir chirría; casual con intermedio, bien. */
export function styleHarmony(a?: string, b?: string): number {
  const fa = FORMALITY[a ?? ''] ?? 1;
  const fb = FORMALITY[b ?? ''] ?? 1;
  return [1, 0.75, 0.3][Math.abs(fa - fb)];
}

/** ¿Pueden ir juntas en un mismo look? (no dos prendas del mismo hueco, ni vestido con pantalón). */
export function compatible(a: GarmentItem, b: GarmentItem): boolean {
  if (a.id === b.id) return false;
  const sa = slotOf(a.category);
  const sb = slotOf(b.category);
  if (sa === sb) return false;
  const dress = a.category === 'dress' || b.category === 'dress';
  return !(dress && (sa === 'bottom' || sb === 'bottom'));
}

/** Puntuación de `candidate` frente a todo lo ya elegido: la media, con el peor par pesando el doble. */
export function pairScore(candidate: GarmentItem, chosen: GarmentItem[]): number {
  if (chosen.some((g) => !compatible(g, candidate))) return 0;
  if (!chosen.length) return 1;
  const scores = chosen.map((g) => 0.6 * colorHarmony(g.color, candidate.color) + 0.4 * styleHarmony(g.style, candidate.style));
  const worst = Math.min(...scores);
  return (scores.reduce((s, x) => s + x, 0) + worst) / (scores.length + 1);
}

/** Las mejores opciones del catálogo para un hueco, de más a menos afines (empate: orden del catálogo). */
export function suggestionsFor(slot: LookSlot, chosen: GarmentItem[], catalog: GarmentItem[], limit = 6): GarmentItem[] {
  const blocked = chosen.some((g) => g.category === 'dress') && slot === 'bottom';
  if (blocked) return [];
  return catalog
    .filter((g) => slotOf(g.category) === slot)
    .map((g, i) => ({ g, i, score: pairScore(g, chosen.filter((c) => slotOf(c.category) !== slot)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.g);
}

/** Look sugerido alrededor de una prenda: el mejor candidato de cada hueco libre, uno tras otro. */
export function completeLook(seed: GarmentItem, catalog: GarmentItem[], slots: LookSlot[] = ['top', 'bottom', 'footwear']): GarmentItem[] {
  const look = [seed];
  for (const slot of slots) {
    if (look.some((g) => slotOf(g.category) === slot)) continue;
    const [best] = suggestionsFor(slot, look, catalog, 1);
    if (best) look.push(best);
  }
  return look;
}
