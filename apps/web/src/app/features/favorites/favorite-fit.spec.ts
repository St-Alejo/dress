import type { FavoriteOutfit, FavoriteOutfitItem, GarmentItem } from '@vestirse/shared-types';
import { fitVerdict, outfitVerdict, totalCents, wearersOf } from './favorite-fit';

const chart = ['S', 'M', 'L', 'XL'].map((size) => ({ size }));
const garment = (category: GarmentItem['category'], priceCents = 1000) => ({ id: category, name: category, category, priceCents, sizeChart: chart }) as unknown as GarmentItem;
const item = (size: string, recommendedSize?: string, category: GarmentItem['category'] = 'top'): FavoriteOutfitItem => ({ garment: garment(category), size, recommendedSize });
const fav = (items: FavoriteOutfitItem[], wearer?: string) => ({ id: 'f', title: 't', imageUrl: '', createdAt: '', items, wearer }) as FavoriteOutfit;

describe('fitVerdict', () => {
  it('compara la talla probada con la recomendada en el orden de la tabla', () => {
    expect(fitVerdict(item('M', 'M'))).toBe('true');
    expect(fitVerdict(item('L', 'M'))).toBe('large');
    expect(fitVerdict(item('XL', 'M'))).toBe('oversize');
    expect(fitVerdict(item('S', 'M'))).toBe('small');
  });

  it('sin recomendación o con tallas fuera de la tabla no opina', () => {
    expect(fitVerdict(item('M'))).toBe('unknown');
    expect(fitVerdict(item('XXL', 'M'))).toBe('unknown');
  });
});

describe('outfitVerdict', () => {
  it('una prenda fuera de talla manda sobre las que van justas; los zapatos no cuentan', () => {
    expect(outfitVerdict(fav([item('M', 'M'), item('L', 'M', 'bottom')]))).toBe('large');
    expect(outfitVerdict(fav([item('M', 'M'), item('S', 'M', 'footwear')]))).toBe('true');
    expect(outfitVerdict(fav([item('M')]))).toBe('unknown');
  });
});

it('wearersOf y totalCents', () => {
  const list = [fav([item('M', 'M')], 'Él'), fav([], 'Ella'), fav([], 'Él'), fav([])];
  expect(wearersOf(list)).toEqual(['Él', 'Ella']);
  expect(totalCents(fav([item('M'), item('L', undefined, 'bottom')]))).toBe(2000);
});
