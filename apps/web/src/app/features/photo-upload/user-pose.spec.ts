import type { BodyPose } from '@vestirse/shared-types';
import { describe, expect, it } from 'vitest';
import { decodeRle } from '../live-overlay/engine/static-pose';
import { encodeRle, localPhotoReason, segSize } from './user-pose';

/** Persona de pie, de frente, ocupando el centro de una foto 3:4. `hidden` = índices BlazePose no visibles. */
function pose(hidden: number[] = []): BodyPose {
  const at: Record<number, [number, number]> = {
    0: [0.5, 0.1], 7: [0.55, 0.1], 8: [0.45, 0.1],
    11: [0.62, 0.25], 12: [0.38, 0.25], 13: [0.66, 0.4], 14: [0.34, 0.4], 15: [0.67, 0.52], 16: [0.33, 0.52],
    23: [0.57, 0.55], 24: [0.43, 0.55], 25: [0.57, 0.72], 26: [0.43, 0.72], 27: [0.57, 0.9], 28: [0.43, 0.9],
    31: [0.58, 0.95], 32: [0.42, 0.95],
  }; // fmt: skip
  const landmarks = Array.from({ length: 33 }, (_, i) => {
    const [x, y] = at[i] ?? [0.5, 0.5];
    return { x, y, v: hidden.includes(i) ? 0.05 : 0.98 };
  });
  return { version: 1, width: 768, height: 1024, landmarks, seg: { width: 2, height: 2, rle: [0, 4] } };
}

describe('pose de la foto propia', () => {
  it('la codificación por tramos ida y vuelta conserva la máscara', () => {
    const labels = Uint8Array.from([0, 0, 3, 3, 3, 1, 0, 0, 0]);
    expect(encodeRle(labels)).toEqual([0, 2, 3, 3, 1, 1, 0, 3]);
    expect(Array.from(decodeRle(encodeRle(labels), labels.length))).toEqual(Array.from(labels));
  });

  it('la máscara respeta la proporción de la foto con el lado largo en 256', () => {
    expect(segSize(768, 1024)).toEqual({ width: 192, height: 256 });
    expect(segSize(1024, 576)).toEqual({ width: 256, height: 144 });
  });

  it('una foto de cuerpo entero sirve para cualquier prenda', () => {
    for (const g of [{ category: 'top' }, { category: 'bottom', style: 'jeans' }, { category: 'footwear' }] as const) {
      expect(localPhotoReason(pose(), g)).toBeNull();
    }
  });

  it('sin persona lo dice antes de subir', () => {
    expect(localPhotoReason(null, { category: 'top' })).toBe('no-person');
  });

  it('pide cuerpo entero solo cuando la prenda lo necesita', () => {
    const noLegs = pose([25, 26, 27, 28, 31, 32]);
    expect(localPhotoReason(noLegs, { category: 'top' })).toBeNull();
    expect(localPhotoReason(noLegs, { category: 'bottom', style: 'jeans' })).toBe('not-full-body');
    expect(localPhotoReason(noLegs, { category: 'footwear' })).toBe('not-full-body');
  });
});
