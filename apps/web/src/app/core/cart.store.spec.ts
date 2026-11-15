import { TestBed } from '@angular/core/testing';
import type { GarmentCategory, GarmentItem } from '@vestirse/shared-types';
import { CartStore, defaultOutfit, toggleWorn } from './cart.store';

const g = (id: string, category: GarmentCategory) => ({ id, category }) as GarmentItem;
const shirt = g('shirt', 'top');
const tee = g('tee', 'top');
const jeans = g('jeans', 'bottom');
const dress = g('dress', 'dress');
const jacket = g('jacket', 'outerwear');
const shoes = g('shoes', 'footwear');

describe('CartStore', () => {
  beforeEach(() => localStorage.clear());

  it('añade, no repite la misma prenda y talla, y lo guarda en el navegador', () => {
    const cart = TestBed.inject(CartStore);
    expect(cart.add('shirt', 'M')).toBe(true);
    expect(cart.add('shirt', 'M')).toBe(false);
    expect(cart.add('shirt', 'L')).toBe(true);
    expect(cart.count()).toBe(2);
    expect(JSON.parse(localStorage.getItem('vestirse:cart')!)).toHaveLength(2);
  });

  it('cambia la talla y quita líneas', () => {
    const cart = TestBed.inject(CartStore);
    cart.add('shirt', null);
    cart.add('jeans', '40');
    cart.setSize(0, 'S');
    cart.remove(1);
    expect(cart.items()).toEqual([{ garmentId: 'shirt', size: 'S' }]);
  });
});

describe('probador', () => {
  it('una prenda por zona: elegir otra camisa sustituye a la anterior', () => {
    expect(toggleWorn([shirt, jeans], tee).map((x) => x.id)).toEqual(['jeans', 'tee']);
  });

  it('un vestido quita camisa y pantalón; volver a elegirlo lo quita', () => {
    const worn = toggleWorn([shirt, jeans, shoes], dress);
    expect(worn.map((x) => x.id)).toEqual(['shoes', 'dress']);
    expect(toggleWorn(worn, dress).map((x) => x.id)).toEqual(['shoes']);
  });

  it('el conjunto inicial toma la primera prenda de cada zona', () => {
    expect(defaultOutfit([shirt, tee, jeans, dress, jacket, shoes]).map((x) => x.id)).toEqual(['shirt', 'jeans', 'jacket', 'shoes']);
  });
});
