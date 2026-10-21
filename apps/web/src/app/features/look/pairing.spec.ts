import type { GarmentCategory, GarmentItem } from '@vestirse/shared-types';
import { describe, expect, it } from 'vitest';
import { colorHarmony, compatible, completeLook, hexToHsl, isNeutral, pairScore, slotOf, styleHarmony, suggestionsFor } from './pairing';

const item = (id: string, category: GarmentCategory, color: string, style?: string): GarmentItem => ({
  id,
  name: id,
  brandId: 'b',
  category,
  color,
  style,
  priceCents: 1000,
  images: { photo: '' },
  photoType: 'flat-lay',
  sizeChart: [],
  stretch: 'low',
});

const whiteTee = item('tee', 'top', '#f2f1ee', 'tshirt');
const redCardigan = item('cardigan', 'top', '#b0141c', 'sweater');
const jeans = item('jeans', 'bottom', '#3c4a63', 'jeans');
const greenTrousers = item('green', 'bottom', '#2f9e44', 'trousers');
const orangeSkirt = item('orange', 'bottom', '#e8590c', 'skirt');
const dress = item('dress', 'dress', '#c92a2a', 'dress-a');
const sneakers = item('sneakers', 'footwear', '#ffffff', 'sneakers');
const coat = item('coat', 'outerwear', '#7a6a58', 'coat');
const hoodie = item('hoodie', 'top', '#d4a5a5', 'hoodie');

describe('combina con: colores', () => {
  it('convierte hex a HSL', () => {
    const red = hexToHsl('#ff0000');
    expect(red.h).toBeCloseTo(0);
    expect(red.s).toBeCloseTo(1);
    expect(hexToHsl('#0000ff').h).toBeCloseTo(240);
  });

  it('blanco, negro y vaquero apagado son neutros', () => {
    expect(isNeutral(hexToHsl('#f2f1ee'))).toBe(true);
    expect(isNeutral(hexToHsl('#111111'))).toBe(true);
    expect(isNeutral(hexToHsl('#3c4a63'))).toBe(true);
    expect(isNeutral(hexToHsl('#e8590c'))).toBe(false);
  });

  it('un neutro combina con todo; dos colores vivos separados un tercio de círculo, mal', () => {
    expect(colorHarmony('#f2f1ee', '#e8590c')).toBe(1);
    expect(colorHarmony('#e8590c', '#2f9e44')).toBeLessThan(0.5);
    expect(colorHarmony('#b0141c', '#c92a2a')).toBeGreaterThan(0.8);
  });

  it('casual con de vestir pesa menos que casual con casual', () => {
    expect(styleHarmony('tshirt', 'jeans')).toBe(1);
    expect(styleHarmony('hoodie', 'coat')).toBeLessThan(styleHarmony('hoodie', 'jacket'));
  });
});

describe('combina con: looks', () => {
  it('un vestido ocupa arriba y abajo: no va con pantalón ni con otra parte de arriba', () => {
    expect(slotOf('dress')).toBe('top');
    expect(compatible(dress, jeans)).toBe(false);
    expect(compatible(dress, whiteTee)).toBe(false);
    expect(compatible(dress, sneakers)).toBe(true);
    expect(pairScore(jeans, [dress])).toBe(0);
  });

  it('para una camiseta blanca sugiere partes de abajo y pone el vaquero entre las primeras', () => {
    const catalog = [greenTrousers, orangeSkirt, jeans, redCardigan, sneakers];
    const bottoms = suggestionsFor('bottom', [whiteTee], catalog);
    expect(bottoms.every((g) => g.category === 'bottom')).toBe(true);
    expect(bottoms[0]).toBe(jeans);
  });

  it('con un cárdigan rojo, la falda naranja va antes que el pantalón verde', () => {
    const order = suggestionsFor('bottom', [redCardigan], [greenTrousers, orangeSkirt]).map((g) => g.id);
    expect(order).toEqual(['orange', 'green']);
  });

  it('con un vestido elegido no hay partes de abajo que sugerir', () => {
    expect(suggestionsFor('bottom', [dress], [jeans, greenTrousers])).toEqual([]);
  });

  it('completa un look alrededor de una prenda, un hueco cada vez y sin repetir', () => {
    const look = completeLook(jeans, [hoodie, whiteTee, sneakers, coat, greenTrousers]);
    expect(look[0]).toBe(jeans);
    expect(look.map((g) => slotOf(g.category))).toEqual(['bottom', 'top', 'footwear']);
    expect(new Set(look.map((g) => g.id)).size).toBe(look.length);
  });

  it('es determinista: mismo catálogo, misma sugerencia', () => {
    const catalog = [greenTrousers, orangeSkirt, jeans];
    expect(suggestionsFor('bottom', [whiteTee], catalog)).toEqual(suggestionsFor('bottom', [whiteTee], [...catalog]));
  });
});
