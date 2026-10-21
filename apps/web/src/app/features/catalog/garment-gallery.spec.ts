import type { SimilarBodyModel } from '@vestirse/shared-types';
import { describe, expect, it } from 'vitest';
import { spreadBySize } from './garment-gallery.component';

const body = (id: string, typicalSize: string, pose = true) => ({ id, typicalSize, ...(pose ? { pose: {} } : {}) }) as unknown as SimilarBodyModel;

describe('galería: modelos de tallas distintas', () => {
  const sizes = ['XS', 'S', 'M', 'L', 'XL'];

  it('elige la talla más chica, una media y la más grande', () => {
    const picked = spreadBySize([body('a', 'M'), body('b', 'XS'), body('c', 'XL'), body('d', 'S'), body('e', 'L')], sizes);
    expect(picked.map((b) => b.typicalSize)).toEqual(['XS', 'M', 'XL']);
  });

  it('solo modelos con pose medida (si no, no se puede vestir la prenda) y sin repetir', () => {
    const picked = spreadBySize([body('a', 'M', false), body('b', 'S'), body('c', 'L')], sizes);
    expect(picked.map((b) => b.id)).toEqual(['b', 'c']);
  });
});
