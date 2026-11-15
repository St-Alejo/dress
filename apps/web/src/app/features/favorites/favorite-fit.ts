import type { FavoriteOutfit, FavoriteOutfitItem } from '@vestirse/shared-types';

/** Cómo le queda la talla probada frente a la recomendada para esa persona. */
export type FitVerdict = 'true' | 'large' | 'oversize' | 'small' | 'unknown';

export function fitVerdict(item: FavoriteOutfitItem): FitVerdict {
  if (!item.recommendedSize) return 'unknown';
  const sizes = item.garment.sizeChart.map((s) => s.size);
  const tried = sizes.indexOf(item.size);
  const rec = sizes.indexOf(item.recommendedSize);
  if (tried < 0 || rec < 0) return 'unknown';
  const d = tried - rec;
  return d === 0 ? 'true' : d >= 2 ? 'oversize' : d > 0 ? 'large' : 'small';
}

/** Lo más llamativo del conjunto para la etiqueta de la tarjeta: una prenda fuera de talla manda. */
export function outfitVerdict(fav: FavoriteOutfit): FitVerdict {
  const verdicts = fav.items.filter((i) => i.garment.category !== 'footwear').map(fitVerdict);
  return (['oversize', 'large', 'small'] as const).find((v) => verdicts.includes(v)) ?? (verdicts.includes('true') ? 'true' : 'unknown');
}

/** Personas distintas que llevan los favoritos, en orden de aparición (para el filtro). */
export function wearersOf(favorites: FavoriteOutfit[]): string[] {
  return [...new Set(favorites.map((f) => f.wearer).filter((w): w is string => !!w))];
}

export function totalCents(fav: FavoriteOutfit): number {
  return fav.items.reduce((sum, i) => sum + i.garment.priceCents, 0);
}
