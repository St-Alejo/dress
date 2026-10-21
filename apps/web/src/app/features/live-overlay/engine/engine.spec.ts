import type { GarmentAnchors } from '@vestirse/shared-types';
import { describe, expect, it } from 'vitest';
import { BodyTracker, HOLD_MS } from './body-tracker';
import { affineFrom3, apply, dist, similarity, type Pt } from './geometry';
import { easeGain, sceneGain } from './lighting';
import { occlusionMask, SEG } from './occlusion';
import { OneEuroFilter } from './one-euro';
import { type Body, buildMesh, lowerPose, poseFor, skin, skinMesh, upperPose, vertexWeights } from './rig';
import { fitForSize } from './size-fit';

const W = 400;
const H = 360;

/** Camiseta de 400×360 px: hombros en x=100/300, puños a los lados, bajo abajo. */
const TEE: GarmentAnchors = {
  version: 1,
  kind: 'upper',
  aspect: W / H,
  sleeve: 'short',
  points: {
    neck: [0.5, 0.05],
    rightShoulder: [0.25, 0.08],
    leftShoulder: [0.75, 0.08],
    rightArmpit: [0.25, 0.42],
    leftArmpit: [0.75, 0.42],
    rightCuff: [0.05, 0.4],
    leftCuff: [0.95, 0.4],
    rightHem: [0.25, 0.97],
    leftHem: [0.75, 0.97],
  },
};

const PANTS: GarmentAnchors = {
  version: 1,
  kind: 'lower',
  aspect: 0.5,
  points: {
    rightWaist: [0.15, 0.02],
    leftWaist: [0.85, 0.02],
    crotch: [0.5, 0.3],
    rightKnee: [0.3, 0.65],
    leftKnee: [0.7, 0.65],
    rightAnkle: [0.3, 0.98],
    leftAnkle: [0.7, 0.98],
  },
};

const j = (x: number, y: number, v = 0.95) => ({ p: [x, y] as Pt, v });

/** Persona de frente en un lienzo de 640×480: "left" queda a la derecha de la imagen. */
function standing(): Body {
  return {
    leftShoulder: j(380, 150),
    rightShoulder: j(260, 150),
    leftElbow: j(395, 230),
    rightElbow: j(245, 230),
    leftWrist: j(400, 300),
    rightWrist: j(240, 300),
    leftHip: j(360, 300),
    rightHip: j(280, 300),
    leftKnee: j(362, 390),
    rightKnee: j(278, 390),
    leftAnkle: j(364, 470),
    rightAnkle: j(276, 470),
    leftEar: j(345, 90),
    rightEar: j(295, 90),
  };
}

describe('geometría', () => {
  it('affineFrom3 lleva los tres puntos exactamente', () => {
    const m = affineFrom3([[0, 0], [10, 0], [0, 10]], [[5, 5], [25, 5], [5, 35]])!;
    expect(apply(m, [10, 0])).toEqual([25, 5]);
    expect(apply(m, [0, 10])).toEqual([5, 35]);
  });

  it('similarity gira y escala alrededor del punto de apoyo', () => {
    const m = similarity([0, 0], [1, 0], [100, 100], [0, 1], 2);
    const p = apply(m, [10, 0]);
    expect(p[0]).toBeCloseTo(100);
    expect(p[1]).toBeCloseTo(120);
  });
});

describe('OneEuroFilter', () => {
  it('quita el temblor de un punto quieto', () => {
    const f = new OneEuroFilter(1, 0.01);
    let out = 0;
    for (let i = 0; i < 60; i++) out = f.filter(100 + (i % 2 ? 4 : -4), i * 33);
    expect(Math.abs(out - 100)).toBeLessThan(2);
  });

  it('sigue un movimiento rápido sin quedarse atrás', () => {
    const f = new OneEuroFilter(1, 0.05);
    let out = 0;
    for (let i = 0; i < 30; i++) out = f.filter(i * 20, i * 33);
    expect(out).toBeGreaterThan(29 * 20 - 40);
  });
});

describe('BodyTracker', () => {
  const lms = (y: number) => Array.from({ length: 33 }, () => ({ x: 0.5, y, visibility: 0.9 }));

  it('mantiene un punto perdido un instante y luego lo suelta', () => {
    const t = new BodyTracker();
    t.update(lms(0.5), 100, 100, 0);
    const lost = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
    expect(t.update(lost, 100, 100, HOLD_MS / 2)?.leftShoulder?.v).toBeGreaterThanOrEqual(0.5);
    expect(t.update(lost, 100, 100, HOLD_MS * 3)?.leftShoulder?.v).toBeLessThan(0.5);
  });
});

describe('rig: pesos de la malla', () => {
  const px = (n: [number, number]): Pt => [n[0] * W, n[1] * H];
  const named = Object.fromEntries(Object.entries(TEE.points).map(([k, v]) => [k, px(v!)]));

  it('el centro del pecho es cuerpo y el puño es manga', () => {
    expect(vertexWeights(TEE, named, [W / 2, H / 2], W)).toEqual([0, 0, 0]);
    const [wr, wl] = vertexWeights(TEE, named, [W * 0.08, H * 0.3], W);
    expect(wr).toBeGreaterThan(0.95);
    expect(wl).toBe(0);
    expect(vertexWeights(TEE, named, [W * 0.92, H * 0.3], W)[1]).toBeGreaterThan(0.95);
  });

  it('la malla solo tiene triángulos donde hay tela y dibuja el torso antes que las mangas', () => {
    const mesh = buildMesh(TEE, W, H, (x, y) => y > H * 0.5 ? x > W * 0.25 && x < W * 0.75 : true, 10);
    expect(mesh.indices.length).toBeGreaterThan(0);
    const firstRegion = mesh.region[mesh.indices[0]];
    const lastRegion = mesh.region[mesh.indices[mesh.indices.length - 1]];
    expect(firstRegion).toBeLessThanOrEqual(lastRegion);
  });
});

describe('rig: pose', () => {
  it('los hombros de la prenda caen sobre los hombros de la persona (con la costura un poco fuera)', () => {
    const body = standing();
    const pose = upperPose(TEE, W, H, body)!;
    const ls = apply(pose.base, [0.75 * W, 0.08 * H]);
    const rs = apply(pose.base, [0.25 * W, 0.08 * H]);
    expect(ls[0]).toBeGreaterThan(380);
    expect(rs[0]).toBeLessThan(260);
    expect(ls[1]).toBeCloseTo(150, 0);
  });

  it('sin caderas a la vista la prenda se coloca igual (encuadre de medio cuerpo)', () => {
    const body = standing();
    delete body.leftHip;
    delete body.rightHip;
    const pose = upperPose(TEE, W, H, body)!;
    const hem = apply(pose.base, [W / 2, 0.97 * H]);
    expect(hem[1]).toBeGreaterThan(150);
    expect(hem[0]).toBeCloseTo(320, 0);
  });

  it('la manga sigue al brazo levantado', () => {
    const body = standing();
    body.leftElbow = j(470, 100); // brazo izquierdo en alto y hacia fuera
    body.leftWrist = j(520, 50);
    const pose = upperPose(TEE, W, H, body)!;
    const cuff: Pt = [0.95 * W, 0.4 * H];
    const relaxed = skin(upperPose(TEE, W, H, standing())!, cuff, [0, 1, 0]);
    const raised = skin(pose, cuff, [0, 1, 0]);
    expect(raised[1]).toBeLessThan(relaxed[1] - 30);
    expect(raised[0]).toBeGreaterThan(relaxed[0]);
  });

  it('la pernera sigue a la rodilla doblada', () => {
    const body = standing();
    body.leftKnee = j(420, 360);
    const pose = lowerPose(PANTS, 200, 400, body)!;
    const straight = skin(lowerPose(PANTS, 200, 400, standing())!, [140, 260], [0, 1, 0]);
    const bent = skin(pose, [140, 260], [0, 1, 0]);
    expect(bent[0]).toBeGreaterThan(straight[0] + 15);
  });

  it('una talla más grande ensancha la prenda, nunca el cuerpo', () => {
    const body = standing();
    const m = poseFor(TEE, 'tshirt', W, H, body, fitForSize(['S', 'M', 'L'], 'M', 'L'))!;
    const n = poseFor(TEE, 'tshirt', W, H, body)!;
    const width = (p: typeof m) => dist(apply(p.base, [0.25 * W, 0.08 * H]), apply(p.base, [0.75 * W, 0.08 * H]));
    expect(width(m)).toBeGreaterThan(width(n));
    // El cuerpo (entrada) no cambia: el rig nunca escribe en él.
    expect(body).toEqual(standing());
  });

  it('skinMesh deja quietos los vértices del torso cuando solo se mueve un brazo', () => {
    const mesh = buildMesh(TEE, W, H, () => true, 8);
    const a = skinMesh(mesh, upperPose(TEE, W, H, standing())!);
    const moved = standing();
    moved.leftElbow = j(470, 100);
    moved.leftWrist = j(520, 50);
    const b = skinMesh(mesh, upperPose(TEE, W, H, moved)!);
    const center = mesh.region.findIndex((r, k) => r === 0 && mesh.rest[k * 2] === W / 2);
    expect(b[center * 2]).toBeCloseTo(a[center * 2]);
    expect(b[center * 2 + 1]).toBeCloseTo(a[center * 2 + 1]);
  });

  it('gorra en la cabeza y calzado en los pies', () => {
    const body = standing();
    const cap = poseFor({ version: 1, kind: 'accessory', aspect: 1, points: {} }, 'cap', 100, 100, body)!;
    expect(apply(cap.base, [50, 62])[1]).toBeLessThan(90);
    const shoes = poseFor({ version: 1, kind: 'footwear', aspect: 2, points: {} }, 'sneakers', 200, 100, body)!;
    expect(apply(shoes.base, [100, 100])[1]).toBeGreaterThan(460);
  });
});

describe('oclusión', () => {
  it('la mano por delante del pecho tapa la prenda y el hombro desnudo no', () => {
    const body = standing();
    body.rightElbow = j(300, 260);
    body.rightWrist = j(330, 220); // mano cruzando el pecho
    const w = 64;
    const h = 48;
    const labels = new Uint8Array(w * h).fill(SEG.clothes);
    const toCanvas = (x: number, y: number): Pt => [x * 10, y * 10];
    const set = (cx: number, cy: number, label: number) => (labels[Math.floor(cy / 10) * w + Math.floor(cx / 10)] = label);
    set(345, 205, SEG.bodySkin); // mano
    set(375, 155, SEG.bodySkin); // hombro con tirante
    set(320, 95, SEG.faceSkin);
    const rg = occlusionMask(labels, w, h, body, toCanvas);
    const at = (cx: number, cy: number) => (Math.floor(cy / 10) * w + Math.floor(cx / 10)) * 2;
    expect(rg[at(345, 205) + 1]).toBe(255);
    expect(rg[at(375, 155)]).toBe(0);
    expect(rg[at(375, 155) + 1]).toBe(0);
    expect(rg[at(320, 95) + 1]).toBe(255);
  });
});

describe('luz de la escena', () => {
  it('oscurece la prenda en una habitación con poca luz y la deja igual con luz de estudio', () => {
    const dim = new Uint8Array(16 * 4).map((_, i) => (i % 4 === 3 ? 255 : 50));
    const studio = new Uint8Array(16 * 4).map((_, i) => (i % 4 === 3 ? 255 : 128));
    expect(sceneGain(dim)[0]).toBeLessThan(0.8);
    expect(sceneGain(studio)[1]).toBeCloseTo(1, 1);
    expect(easeGain([1, 1, 1], [0, 0, 0], 0.5)).toEqual([0.5, 0.5, 0.5]);
  });
});

describe('talla visible', () => {
  it('compara tallas respecto de la recomendada', () => {
    expect(fitForSize(['S', 'M', 'L'], 'M', 'M')).toEqual({ width: 1, length: 1 });
    expect(fitForSize(['S', 'M', 'L'], 'M', 'S').width).toBeLessThan(1);
    expect(fitForSize(['S', 'M', 'L'], undefined, 'L')).toEqual({ width: 1, length: 1 });
  });
});
