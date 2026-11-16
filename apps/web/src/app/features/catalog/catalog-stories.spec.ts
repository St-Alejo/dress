import type { GarmentItem } from '@vestirse/shared-types';
import { interleaveStories } from './catalog.page';

const garments = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'g' + i }) as GarmentItem);

describe('interleaveStories', () => {
  it('intercala una foto de campaña cada 7 prendas', () => {
    const cells = interleaveStories(garments(22), true);
    const stories = cells.map((c, i) => (c.story ? i : -1)).filter((i) => i >= 0);
    expect(stories).toEqual([7, 15, 23]);
    expect(cells.filter((c) => c.garment)).toHaveLength(22);
  });

  it('nunca deja una foto de campaña al final de la lista', () => {
    const cells = interleaveStories(garments(7), true);
    expect(cells.at(-1)?.garment?.id).toBe('g6');
    expect(cells.some((c) => c.story)).toBe(false);
  });

  it('con filtros solo muestra prendas', () => {
    expect(interleaveStories(garments(30), false).every((c) => c.garment)).toBe(true);
  });

  it('las claves son únicas para el track del @for', () => {
    const keys = interleaveStories(garments(40), true).map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
