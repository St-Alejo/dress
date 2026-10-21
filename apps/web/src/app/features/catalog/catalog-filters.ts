import type { GarmentCategory, GarmentItem } from '@vestirse/shared-types';
import { hexToHsl, isNeutral } from '../look/pairing';

/** Familias de color para filtrar: se calculan del color de la prenda, no se cargan a mano. */
export const COLOR_FAMILIES = ['neutral', 'earth', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'] as const;
export type ColorFamily = (typeof COLOR_FAMILIES)[number];

export function colorFamily(hex: string): ColorFamily {
  const c = hexToHsl(hex);
  if (isNeutral(c)) return 'neutral';
  const h = c.h;
  // Beige, camel, marrón: naranjas apagados u oscuros. Un amarillo oscuro es oliva.
  if (h >= 12 && h < 50 && (c.s < 0.55 || c.l < 0.45)) return 'earth';
  if (h >= 50 && h < 68 && c.l < 0.45) return 'green';
  if (h < 12 || h >= 345) return c.l > 0.62 ? 'pink' : 'red';
  if (h < 40) return c.l > 0.75 ? 'pink' : 'orange';
  if (h < 68) return 'yellow';
  if (h < 170) return 'green';
  if (h < 255) return 'blue';
  if (h < 295) return 'purple';
  return 'pink';
}

/** Tramos de precio en centavos [desde, hasta). */
export const PRICE_BANDS = { low: [0, 3000], mid: [3000, 7000], high: [7000, Infinity] } as const;
export type PriceBand = keyof typeof PRICE_BANDS;
export type SortOrder = 'relevance' | 'price-asc' | 'price-desc' | 'name';

export interface CatalogFilters {
  q: string;
  category: GarmentCategory | null;
  brandId: string | null;
  color: ColorFamily | null;
  size: string | null;
  price: PriceBand | null;
  sort: SortOrder;
}

export const NO_FILTERS: CatalogFilters = { q: '', category: null, brandId: null, color: null, size: null, price: null, sort: 'relevance' };

/** Quita tildes y mayúsculas: "camisa" encuentra "Camisa", "pantalon" encuentra "Pantalón". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Aplica filtros y orden. La búsqueda mira nombre, marca y estilo, y exige todas las palabras. */
export function filterGarments(garments: GarmentItem[], f: CatalogFilters): GarmentItem[] {
  const words = fold(f.q).split(/\s+/).filter(Boolean);
  const list = garments.filter((g) => {
    if (f.category && g.category !== f.category) return false;
    if (f.brandId && g.brandId !== f.brandId) return false;
    if (f.color && colorFamily(g.color) !== f.color) return false;
    if (f.size && !g.sizeChart.some((s) => s.size === f.size)) return false;
    if (f.price) {
      const [lo, hi] = PRICE_BANDS[f.price];
      if (g.priceCents < lo || g.priceCents >= hi) return false;
    }
    if (words.length) {
      const hay = fold(`${g.name} ${g.brandName ?? ''} ${g.style ?? ''}`);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  if (f.sort === 'price-asc') return [...list].sort((a, b) => a.priceCents - b.priceCents);
  if (f.sort === 'price-desc') return [...list].sort((a, b) => b.priceCents - a.priceCents);
  if (f.sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return list;
}

/** Tallas presentes en el catálogo, en el orden habitual. */
export function sizesIn(garments: GarmentItem[]): string[] {
  const order = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];
  const all = new Set(garments.flatMap((g) => g.sizeChart.map((s) => s.size)));
  return [...all].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0 || ib >= 0) return ia >= 0 ? -1 : 1;
    return a.localeCompare(b, 'es', { numeric: true });
  });
}

/** Filtros desde la URL (`?q=&cat=&color=&talla=&precio=&orden=`), ignorando valores desconocidos. */
export function filtersFromQuery(q: Record<string, string | undefined>, categories: readonly string[]): CatalogFilters {
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[]): T | null => (v && (allowed as readonly string[]).includes(v) ? (v as T) : null);
  return {
    q: (q['q'] ?? '').slice(0, 80),
    category: pick(q['cat'], categories) as GarmentCategory | null,
    brandId: q['marca'] && /^[\w-]{1,64}$/.test(q['marca']) ? q['marca'] : null,
    color: pick(q['color'], COLOR_FAMILIES),
    size: q['talla'] && /^[\w]{1,6}$/.test(q['talla']) ? q['talla'] : null,
    price: pick(q['precio'], Object.keys(PRICE_BANDS) as PriceBand[]),
    sort: pick(q['orden'], ['relevance', 'price-asc', 'price-desc', 'name'] as const) ?? 'relevance',
  };
}

export function filtersToQuery(f: CatalogFilters): Record<string, string | null> {
  return {
    q: f.q || null,
    cat: f.category,
    marca: f.brandId,
    color: f.color,
    talla: f.size,
    precio: f.price,
    orden: f.sort === 'relevance' ? null : f.sort,
  };
}

export function activeCount(f: CatalogFilters): number {
  return [f.category, f.brandId, f.color, f.size, f.price, f.q || null].filter((v) => v !== null).length;
}
