import { describe, expect, it } from 'vitest';
import type { GarmentAnchors } from '@vestirse/shared-types';
import type { Body } from './engine/rig';
import type { Pt } from './engine/geometry';
import { canOverlay, fitHintFor, needsFor, poseRatiosFrom } from './overlay-geometry';

const j = (x: number, y: number, v = 0.99) => ({ p: [x, y] as Pt, v });

const body = (over: Partial<Body> = {}): Body => ({
  leftShoulder: j(700, 300),
  rightShoulder: j(500, 300),
  leftHip: j(670, 600),
  rightHip: j(530, 600),
  leftKnee: j(665, 800),
  rightKnee: j(535, 800),
  leftAnkle: j(660, 980),
  rightAnkle: j(540, 980),
  leftEar: j(630, 180),
  rightEar: j(570, 180),
  ...over,
});

describe('fitHintFor (guía de encuadre)', () => {
  it('sin cuerpo', () => expect(fitHintFor(null, 1000)).toBe('no-body'));
  it('lejos', () => expect(fitHintFor(body({ leftShoulder: j(540, 300) }), 1000)).toBe('too-far'));
  it('cerca', () => expect(fitHintFor(body({ leftShoulder: j(900, 300), rightShoulder: j(300, 300) }), 1000)).toBe('too-close'));
  it('una parte de arriba no necesita ver la cadera', () => expect(fitHintFor(body({ leftHip: j(0, 0, 0.1) }), 1000, 'shoulders')).toBe('good'));
  it('un pantalón sí', () => expect(fitHintFor(body({ leftHip: j(0, 0, 0.1) }), 1000, 'legs')).toBe('show-hips'));
  it('y también las rodillas', () => expect(fitHintFor(body({ leftKnee: j(0, 0, 0.1) }), 1000, 'legs')).toBe('show-legs'));
  it('el calzado necesita los tobillos', () => expect(fitHintFor(body({ rightAnkle: j(0, 0, 0.2) }), 1000, 'feet')).toBe('show-feet'));
  it('bien', () => expect(fitHintFor(body(), 1000, 'legs')).toBe('good'));
});

describe('needsFor', () => {
  it('pide la parte del cuerpo que la prenda viste', () => {
    expect(needsFor({ category: 'top' })).toBe('shoulders');
    expect(needsFor({ category: 'bottom', style: 'jeans' })).toBe('legs');
    expect(needsFor({ category: 'bottom', style: 'skirt' })).toBe('hips');
    expect(needsFor({ category: 'footwear' })).toBe('feet');
    expect(needsFor({ category: 'accessory', style: 'cap' })).toBe('head');
  });
});

describe('poseRatiosFrom', () => {
  it('normaliza la relación hombros/caderas', () => {
    expect(poseRatiosFrom(body())!.shoulderToHipRatio).toBeCloseTo(200 / 140 / 1.45, 2);
  });
  it('no inventa proporciones si no ve bien el cuerpo', () => {
    expect(poseRatiosFrom(body({ leftHip: j(670, 600, 0.3) }))).toBeNull();
  });
});

describe('recorte de la foto real en la cámara', () => {
  const anchors: GarmentAnchors = { version: 1, kind: 'upper', aspect: 1, points: {} };
  it('se ofrece con recorte y anclas medidas, venga de una foto sola o extraída', () => {
    expect(canOverlay({ images: { photo: 'p.jpg', cutout: 'c.webp' }, anchors })).toBe(true);
    expect(canOverlay({ images: { photo: 'p.jpg' }, anchors })).toBe(false);
    expect(canOverlay({ images: { photo: 'p.jpg', cutout: 'c.webp' } })).toBe(false);
  });
});
