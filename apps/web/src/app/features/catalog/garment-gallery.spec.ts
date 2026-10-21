import type { SimilarBodyModel } from '@vestirse/shared-types';
import { describe, expect, it } from 'vitest';
import { restingBody, spreadBySize } from './garment-gallery.component';

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

describe('modelo por defecto para la vista rápida', () => {
  // Hombros 11/12, codos 13/14, muñecas 15/16; el resto no importa.
  const posed = (id: string, elbowDx: number) => {
    const landmarks = Array.from({ length: 17 }, () => ({ x: 0.5, y: 0.5, v: 1 }));
    landmarks[11] = { x: 0.6, y: 0.2, v: 1 };
    landmarks[12] = { x: 0.4, y: 0.2, v: 1 };
    landmarks[13] = { x: 0.6 + elbowDx, y: 0.35, v: 1 };
    landmarks[14] = { x: 0.4, y: 0.35, v: 1 };
    landmarks[15] = { x: 0.6, y: 0.5, v: 1 };
    landmarks[16] = { x: 0.4, y: 0.5, v: 1 };
    return { id, pose: { version: 1, width: 100, height: 100, landmarks, seg: { width: 1, height: 1, rle: [] } } } as unknown as SimilarBodyModel;
  };

  it('elige el de brazos más sueltos e ignora los que no tienen pose', () => {
    expect(restingBody([posed('brazo-arriba', 0.2), body('sin-pose', 'M', false), posed('sueltos', 0.01)])?.id).toBe('sueltos');
    expect(restingBody([])).toBeNull();
  });
});
