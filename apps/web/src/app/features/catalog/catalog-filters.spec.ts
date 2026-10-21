import type { GarmentCategory, GarmentItem } from '@vestirse/shared-types';
import { describe, expect, it } from 'vitest';
import { NO_FILTERS, activeCount, colorFamily, filterGarments, filtersFromQuery, filtersToQuery, fold, sizesIn } from './catalog-filters';

const g = (id: string, name: string, category: GarmentCategory, color: string, priceCents: number, sizes: string[], brandName = 'Norte'): GarmentItem =>
  ({ id, name, brandId: brandName.toLowerCase(), brandName, category, color, priceCents, sizeChart: sizes.map((size) => ({ size })), images: { photo: '' } }) as unknown as GarmentItem;

const catalog = [
  g('1', 'Camiseta básica blanca', 'top', '#f2f1ee', 1999, ['S', 'M', 'L']),
  g('2', 'Pantalón de pana oliva', 'bottom', '#6b7d3a', 5999, ['28', '30', '32']),
  g('3', 'Vestido rojo plisado', 'dress', '#c92a2a', 8999, ['XS', 'S', 'M'], 'Brisa'),
  g('4', 'Camisa Oxford celeste', 'top', '#a9c8e8', 4499, ['M', 'L', 'XL']),
];
const CATS = ['top', 'bottom', 'dress', 'outerwear', 'footwear', 'accessory'];

describe('filtros de tienda', () => {
  it('agrupa colores en familias', () => {
    expect(colorFamily('#f2f1ee')).toBe('neutral');
    expect(colorFamily('#c92a2a')).toBe('red');
    expect(colorFamily('#6b7d3a')).toBe('green');
    expect(colorFamily('#a9c8e8')).toBe('blue');
    expect(colorFamily('#e2cf8f')).toBe('yellow');
    expect(colorFamily('#d9838a')).toBe('pink');
    expect(colorFamily('#a67b5b')).toBe('earth');
    expect(colorFamily('#e8590c')).toBe('orange');
  });

  it('busca sin tildes ni mayúsculas y exige todas las palabras', () => {
    expect(fold('Pantalón')).toBe('pantalon');
    expect(filterGarments(catalog, { ...NO_FILTERS, q: 'pantalon oliva' }).map((x) => x.id)).toEqual(['2']);
    expect(filterGarments(catalog, { ...NO_FILTERS, q: 'brisa' }).map((x) => x.id)).toEqual(['3']);
    expect(filterGarments(catalog, { ...NO_FILTERS, q: 'camisa roja' })).toEqual([]);
  });

  it('combina categoría, color, talla y precio', () => {
    expect(filterGarments(catalog, { ...NO_FILTERS, category: 'top', size: 'XL' }).map((x) => x.id)).toEqual(['4']);
    expect(filterGarments(catalog, { ...NO_FILTERS, price: 'low' }).map((x) => x.id)).toEqual(['1']);
    expect(filterGarments(catalog, { ...NO_FILTERS, price: 'high', color: 'red' }).map((x) => x.id)).toEqual(['3']);
  });

  it('ordena por precio y por nombre sin tocar el catálogo', () => {
    expect(filterGarments(catalog, { ...NO_FILTERS, sort: 'price-desc' }).map((x) => x.id)).toEqual(['3', '2', '4', '1']);
    expect(filterGarments(catalog, { ...NO_FILTERS, sort: 'name' })[0].id).toBe('4');
    expect(catalog.map((x) => x.id)).toEqual(['1', '2', '3', '4']);
  });

  it('tallas en orden habitual: letras primero, luego números', () => {
    expect(sizesIn(catalog)).toEqual(['XS', 'S', 'M', 'L', 'XL', '28', '30', '32']);
  });

  it('ida y vuelta por la URL, descartando valores raros', () => {
    const f = { ...NO_FILTERS, q: 'camisa', category: 'top' as const, color: 'blue' as const, size: 'M', price: 'mid' as const, sort: 'price-asc' as const };
    const q = Object.fromEntries(Object.entries(filtersToQuery(f)).filter(([, v]) => v !== null)) as Record<string, string>;
    expect(filtersFromQuery(q, CATS)).toEqual(f);
    expect(filtersFromQuery({ cat: 'zapatos', color: 'fucsia', orden: 'x', talla: '<b>' }, CATS)).toEqual(NO_FILTERS);
    expect(activeCount(f)).toBe(5);
  });
});
