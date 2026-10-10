import { describe, expect, it } from 'vitest';
import type { OverlayAnchors } from '@vestirse/shared-types';
import { affineFrom3, applyAffine, canOverlay, cutoutAnchors, fitHintFor, overlayTransform, poseRatiosFrom, type PosePoints, type Pt } from './overlay-geometry';

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

describe('recorte de la foto real en la cámara', () => {
  it('solo se ofrece con una prenda fotografiada sola y con recorte', () => {
    const flat = { category: 'top', photoType: 'flat-lay', images: { photo: 'p.jpg', cutout: 'c.webp' } } as const;
    expect(canOverlay(flat)).toBe(true);
    expect(canOverlay({ ...flat, images: { photo: 'p.jpg' } })).toBe(false);
    expect(canOverlay({ ...flat, photoType: 'model' })).toBe(false);
    expect(canOverlay({ ...flat, category: 'footwear' })).toBe(false);
  });

  it('las anclas respetan la convención de MediaPipe: "izquierda" es la derecha de la imagen', () => {
    for (const category of ['top', 'outerwear', 'dress', 'bottom'] as const) {
      const a = cutoutAnchors(category, 400, 600);
      expect(a.leftShoulder[0]).toBeGreaterThan(a.rightShoulder[0]);
      expect(a.leftHip[0]).toBeGreaterThan(a.rightHip[0]);
      expect(a.leftHip[1]).toBeGreaterThan(a.leftShoulder[1]);
    }
  });

  it('en una parte de arriba los hombros caen dentro del recorte; en un pantalón, por encima', () => {
    expect(cutoutAnchors('top', 400, 600).leftShoulder[1]).toBeGreaterThan(0);
    expect(cutoutAnchors('bottom', 400, 600).leftShoulder[1]).toBeLessThan(0);
  });

  it('el recorte se alinea con la pose detectada', () => {
    const m = overlayTransform(cutoutAnchors('top', 400, 600), pose());
    expect(m).not.toBeNull();
  });
});
