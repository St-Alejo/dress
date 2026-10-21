import { beforeEach, describe, expect, it } from 'vitest';
import { LookStore, MAX_LOOKS, lookQuery, parseLookIds } from './look.store';

describe('LookStore', () => {
  beforeEach(() => localStorage.clear());

  it('guarda en este navegador y sobrevive a recargar', () => {
    new LookStore().save(['a', 'b'], 'b01', 1);
    const again = new LookStore();
    expect(again.looks()).toHaveLength(1);
    expect(again.looks()[0]).toMatchObject({ garmentIds: ['a', 'b'], bodyId: 'b01' });
  });

  it('el mismo look no se repite: sube al principio', () => {
    const store = new LookStore();
    const first = store.save(['a', 'b'], null, 1)!;
    store.save(['c'], null, 2);
    const again = store.save(['b', 'a'], null, 3)!;
    expect(store.looks().map((l) => l.garmentIds)).toEqual([['b', 'a'], ['c']]);
    expect(again.id).toBe(first.id);
  });

  it('no guarda un look vacío y tiene un tope', () => {
    const store = new LookStore();
    expect(store.save([], null)).toBeNull();
    for (let i = 0; i < MAX_LOOKS + 5; i++) store.save([`g${i}`], null, i);
    expect(store.looks()).toHaveLength(MAX_LOOKS);
  });

  it('borrar uno y borrar todo', () => {
    const store = new LookStore();
    const a = store.save(['a'], null, 1)!;
    store.save(['b'], null, 2);
    store.remove(a.id);
    expect(store.looks().map((l) => l.garmentIds[0])).toEqual(['b']);
    store.clear();
    expect(new LookStore().looks()).toEqual([]);
  });

  it('ignora datos corruptos guardados', () => {
    localStorage.setItem('vestirse:looks', JSON.stringify([{ nope: 1 }, { id: 'x', garmentIds: ['a'], bodyId: null, createdAt: 1 }]));
    expect(new LookStore().looks().map((l) => l.id)).toEqual(['x']);
  });
});

describe('enlace de un look', () => {
  it('ida y vuelta por la URL', () => {
    const q = lookQuery(['a-1', 'b_2'], 'b03');
    expect(q).toEqual({ prendas: 'a-1,b_2', modelo: 'b03' });
    expect(parseLookIds(q['prendas'])).toEqual(['a-1', 'b_2']);
  });

  it('descarta ids raros, repetidos y de más', () => {
    expect(parseLookIds('a,a,<script>,b')).toEqual(['a', 'b']);
    expect(parseLookIds(Array.from({ length: 20 }, (_, i) => `g${i}`).join(','))).toHaveLength(8);
    expect(parseLookIds(null)).toEqual([]);
  });
});
