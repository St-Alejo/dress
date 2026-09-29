import { describe, expect, it } from 'vitest';
import type { OverlayAnchors } from '@vestirse/shared-types';
import { affineFrom3, applyAffine, fitHintFor, overlayTransform, poseRatiosFrom, type PosePoints, type Pt } from './overlay-geometry';

const anchors: OverlayAnchors = {
  leftShoulder: [292, 250],
  rightShoulder: [108, 250],
  leftHip: [270, 500],
  rightHip: [130, 500],
};

const pose = (over: Partial<PosePoints> = {}): PosePoints => ({
  leftShoulder: [700, 300],
  rightShoulder: [500, 300],
  leftHip: [670, 600],
  rightHip: [530, 600],
  shouldersVisible: 0.99,
  hipsVisible: 0.99,
  ...over,
});

describe('affineFrom3', () => {
  it('mapea exactamente los tres puntos', () => {
    const src: [Pt, Pt, Pt] = [[0, 0], [10, 0], [0, 10]];
    const dst: [Pt, Pt, Pt] = [[5, 5], [25, 5], [5, 35]];
    const m = affineFrom3(src, dst)!;
    src.forEach((p, i) => {
      const [x, y] = applyAffine(m, p);
      expect(x).toBeCloseTo(dst[i][0]);
      expect(y).toBeCloseTo(dst[i][1]);
    });
  });

  it('devuelve null con puntos colineales', () => {
    expect(affineFrom3([[0, 0], [1, 1], [2, 2]], [[0, 0], [1, 1], [2, 2]])).toBeNull();
  });
});

describe('overlayTransform', () => {
  it('lleva los hombros de la prenda a los hombros detectados', () => {
    const p = pose();
    const m = overlayTransform(anchors, p)!;
    const [lx, ly] = applyAffine(m, anchors.leftShoulder);
    expect(lx).toBeCloseTo(p.leftShoulder[0]);
    expect(ly).toBeCloseTo(p.leftShoulder[1]);
  });
});

describe('fitHintFor (guía de encuadre)', () => {
  it('sin cuerpo', () => expect(fitHintFor(null, 1000)).toBe('no-body'));
  it('lejos', () => expect(fitHintFor(pose({ leftShoulder: [540, 300], rightShoulder: [500, 300] }), 1000)).toBe('too-far'));
  it('cerca', () => expect(fitHintFor(pose({ leftShoulder: [900, 300], rightShoulder: [300, 300] }), 1000)).toBe('too-close'));
  it('faltan caderas', () => expect(fitHintFor(pose({ hipsVisible: 0.1 }), 1000)).toBe('show-hips'));
  it('bien', () => expect(fitHintFor(pose(), 1000)).toBe('good'));
});

describe('poseRatiosFrom', () => {
  it('normaliza la relación hombros/caderas', () => {
    const r = poseRatiosFrom(pose())!;
    expect(r.shoulderToHipRatio).toBeCloseTo(200 / 140 / 1.45, 2);
  });
  it('no inventa proporciones si no ve bien el cuerpo', () => {
    expect(poseRatiosFrom(pose({ hipsVisible: 0.3 }))).toBeNull();
  });
});
