import type { GarmentItem } from '@vestirse/shared-types';
import { aiPieces, MAX_AI_PIECES } from './ai-outfit.component';

const g = (id: string, category: GarmentItem['category']) => ({ id, category }) as GarmentItem;

describe('aiPieces', () => {
  const look = [g('gorra', 'accessory'), g('tenis', 'footwear'), g('blazer', 'outerwear'), g('camisa', 'top'), g('jean', 'bottom')];

  it('ordena el look de dentro hacia fuera, como lo viste la IA', () => {
    expect(aiPieces(look, new Set()).map((x) => x.id)).toEqual(['jean', 'camisa', 'blazer', 'tenis', 'gorra']);
  });

  it('prenda por prenda: solo las marcadas', () => {
    expect(aiPieces(look, new Set(['gorra', 'tenis', 'blazer', 'jean'])).map((x) => x.id)).toEqual(['camisa']);
  });

  it('nunca pasa del máximo de una edición', () => {
    const many = [...look, g('otra', 'top')];
    expect(aiPieces(many, new Set())).toHaveLength(MAX_AI_PIECES);
  });
});
