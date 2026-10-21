import type { GarmentAnchors } from '@vestirse/shared-types';
import {
  type Affine,
  type Pt,
  add,
  affineFrom3,
  along,
  apply,
  clamp,
  dist,
  lerp,
  limitTurn,
  mid,
  scale,
  signedDistance,
  similarity,
  smoothstep,
  sub,
  unit,
} from './geometry';

/**
 * Rig 2D de una prenda: una malla sobre el recorte cuyos vértices se mueven con "huesos"
 * (torso, brazo, antebrazo, pelvis, muslo, pierna). Cada vértice mezcla como mucho tres
 * transformaciones con pesos que dependen de su posición en la foto de la prenda, así que
 * la manga gira con el brazo y la pernera con la rodilla sin rasgar la tela.
 *
 * Todo es puro (sin DOM) y trabaja en píxeles: los del recorte para la prenda y los del
 * lienzo para el cuerpo. Solo se deforma la PRENDA; el cuerpo de la persona nunca se toca.
 */

/** Articulación detectada: posición en px del lienzo y visibilidad 0..1. */
export interface Joint {
  p: Pt;
  v: number;
}

export type JointName =
  | 'nose' | 'leftEar' | 'rightEar'
  | 'leftShoulder' | 'rightShoulder' | 'leftElbow' | 'rightElbow' | 'leftWrist' | 'rightWrist'
  | 'leftHip' | 'rightHip' | 'leftKnee' | 'rightKnee' | 'leftAnkle' | 'rightAnkle'
  | 'leftFoot' | 'rightFoot';

export type Body = Partial<Record<JointName, Joint>>;

/** Cómo de holgada se ve la talla elegida respecto de la recomendada (1 = tal cual). */
export interface Fit {
  width: number;
  length: number;
}

export const NEUTRAL_FIT: Fit = { width: 1, length: 1 };

const VISIBLE = 0.5;
const seen = (j?: Joint): j is Joint => !!j && j.v >= VISIBLE;

/** Los hombros de MediaPipe son centros articulares: la costura del hombro queda un poco fuera. */
const SHOULDER_SEAM = 1.1;
/** Ancho del contorno de cadera respecto de la distancia entre articulaciones de cadera. */
const HIP_CONTOUR = 1.7;
/** Giro máximo de una manga o pernera respecto de su caída con el torso (radianes, ~40°). */
const MAX_SLEEVE_TURN = 0.7;

export interface Mesh {
  /** Posiciones en px del recorte (x, y intercalados). */
  rest: Float32Array;
  /** Coordenadas de textura (u, v). */
  uv: Float32Array;
  /** Triángulos, ordenados para dibujar el torso antes que las mangas. */
  indices: Uint16Array;
  /** Pesos por vértice: [manga/pierna derecha, manga/pierna izquierda, tramo bajo (antebrazo/espinilla)]. */
  weights: Float32Array;
  /** 0 = cuerpo de la prenda, 1 = manga o pernera (el shader decide la oclusión con esto). */
  region: Float32Array;
  width: number;
  height: number;
}

type Named = Partial<Record<string, Pt>>;

function anchorPx(a: GarmentAnchors, w: number, h: number): Named {
  const out: Named = {};
  for (const [k, p] of Object.entries(a.points)) if (p) out[k] = [p[0] * w, p[1] * h];
  return out;
}

/** Codo de la prenda: a mitad de la manga larga; en manga corta, el propio puño. */
function garmentElbow(a: GarmentAnchors, shoulder: Pt, cuff: Pt): Pt {
  return a.sleeve === 'long' ? lerp(shoulder, cuff, 0.48) : cuff;
}

function hipJoint(waist: Pt, crotch: Pt): Pt {
  return [(waist[0] + crotch[0]) / 2, (waist[1] * 0.35 + crotch[1] * 0.65)];
}

/**
 * Construye la malla de la prenda. `alphaAt(x, y)` dice si hay tela en ese punto del recorte
 * (se usa para descartar celdas vacías). `cols` controla la densidad.
 */
export function buildMesh(anchors: GarmentAnchors, width: number, height: number, alphaAt: (x: number, y: number) => boolean, cols = 22): Mesh {
  const rows = Math.max(8, Math.round(cols / Math.max(anchors.aspect, 0.25)));
  const nx = cols + 1;
  const ny = rows + 1;
  const rest = new Float32Array(nx * ny * 2);
  const uv = new Float32Array(nx * ny * 2);
  const weights = new Float32Array(nx * ny * 3);
  const region = new Float32Array(nx * ny);
  const pts = anchorPx(anchors, width, height);

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = (i / cols) * width;
      const y = (j / rows) * height;
      rest[k * 2] = x;
      rest[k * 2 + 1] = y;
      uv[k * 2] = i / cols;
      uv[k * 2 + 1] = j / rows;
      const [wr, wl, wf] = vertexWeights(anchors, pts, [x, y], width);
      weights[k * 3] = wr;
      weights[k * 3 + 1] = wl;
      weights[k * 3 + 2] = wf;
      region[k] = Math.max(wr, wl);
    }
  }

  // Celdas con tela (se prueba una rejilla de 3×3 puntos dentro de cada celda).
  const body: number[] = [];
  const limbs: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let filled = false;
      for (let sy = 0; sy <= 2 && !filled; sy++) {
        for (let sx = 0; sx <= 2 && !filled; sx++) filled = alphaAt(((i + sx / 2) / cols) * width, ((j + sy / 2) / rows) * height);
      }
      if (!filled) continue;
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      const target = (region[a] + region[b] + region[c] + region[d]) / 4 > 0.5 ? limbs : body;
      target.push(a, c, b, b, c, d);
    }
  }
  return { rest, uv, indices: Uint16Array.from([...body, ...limbs]), weights, region, width, height };
}

/** Pesos de un punto del recorte: cuánto pertenece a la manga/pierna derecha, izquierda y al tramo bajo. */
export function vertexWeights(anchors: GarmentAnchors, p: Named, v: Pt, width: number): [number, number, number] {
  if (anchors.kind === 'upper') {
    const rs = p['rightShoulder'];
    const ls = p['leftShoulder'];
    const ra = p['rightArmpit'];
    const la = p['leftArmpit'];
    const rc = p['rightCuff'];
    const lc = p['leftCuff'];
    // Sin manga o con las mangas colgando en la foto: toda la prenda sigue al torso.
    if (!rs || !ls || !ra || !la || !rc || !lc || anchors.sleeve === 'none' || anchors.sleeve === 'hanging') return [0, 0, 0];
    const band = dist(rs, ls) * 0.07;
    const centerX = (rs[0] + ls[0]) / 2;
    // Hasta la axila la frontera es la costura hombro→axila; por debajo, el borde vertical del
    // torso. Así un puño mal medido nunca convierte medio torso en manga.
    const side = (s: Pt, a: Pt) => {
      const out = Math.sign(s[0] - centerX) || 1; // hacia fuera de la prenda
      if (v[1] > a[1]) return smoothstep(-band, band, (v[0] - a[0]) * out);
      const outward = Math.sign(signedDistance(add(a, [out, 0]), s, a)) || 1;
      return smoothstep(-band, band, signedDistance(v, s, a) * outward);
    };
    const wr = side(rs, ra);
    const wl = side(ls, la);
    let wf = 0;
    if (anchors.sleeve === 'long') {
      const t = wr >= wl ? along(v, rs, rc) : along(v, ls, lc);
      wf = smoothstep(0.4, 0.58, t);
    }
    return [wr, wl, wf];
  }
  if (anchors.kind === 'lower') {
    const rw = p['rightWaist'];
    const lw = p['leftWaist'];
    const cr = p['crotch'];
    const rk = p['rightKnee'];
    const lk = p['leftKnee'];
    if (!rw || !lw || !cr || !rk || !lk) return [0, 0, 0];
    const top = Math.min(rw[1], lw[1]);
    const leg = smoothstep(top + (cr[1] - top) * 0.25, cr[1] + width * 0.02, v[1]);
    const isRight = v[0] < cr[0];
    const hip = hipJoint(isRight ? rw : lw, cr);
    const knee = isRight ? rk : lk;
    const wf = smoothstep(0.82, 1.18, along(v, hip, knee));
    return isRight ? [leg, 0, wf] : [0, leg, wf];
  }
  return [0, 0, 0];
}

/** Las transformaciones de un fotograma: cuerpo de la prenda y, por lado, tramo alto y bajo. */
export interface Pose {
  base: Affine;
  right: [Affine, Affine];
  left: [Affine, Affine];
  /** Escala px del recorte → px del lienzo, útil para la sombra y el difuminado del borde. */
  scale: number;
}

/** Posición de un vértice con skinning lineal. */
export function skin(pose: Pose, v: Pt, w: [number, number, number]): Pt {
  const [wr, wl, wf] = w;
  const base = apply(pose.base, v);
  if (wr === 0 && wl === 0) return base;
  const limb = wr >= wl ? pose.right : pose.left;
  const wl2 = Math.max(wr, wl);
  const upper = apply(limb[0], v);
  const lower = apply(limb[1], v);
  const onLimb = lerp(upper, lower, wf);
  return lerp(base, onLimb, wl2);
}

/** Aplica la pose a toda la malla: devuelve las posiciones en px del lienzo. */
export function skinMesh(mesh: Mesh, pose: Pose, out: Float32Array = new Float32Array(mesh.rest.length)): Float32Array {
  for (let k = 0; k < mesh.region.length; k++) {
    const [x, y] = skin(pose, [mesh.rest[k * 2], mesh.rest[k * 2 + 1]], [mesh.weights[k * 3], mesh.weights[k * 3 + 1], mesh.weights[k * 3 + 2]]);
    out[k * 2] = x;
    out[k * 2 + 1] = y;
  }
  return out;
}

/** Dirección "hacia abajo" del cuerpo: de hombros a caderas, o perpendicular a los hombros. */
function downOf(body: Body): Pt | null {
  const ls = body.leftShoulder;
  const rs = body.rightShoulder;
  if (!seen(ls) || !seen(rs)) return null;
  const sm = mid(ls.p, rs.p);
  if (seen(body.leftHip) && seen(body.rightHip)) return unit(sub(mid(body.leftHip.p, body.rightHip.p), sm));
  // Perpendicular a la línea de hombros (izquierda de la persona → derecha de la imagen).
  const across = unit(sub(ls.p, rs.p));
  return [-across[1], across[0]];
}

/** Hueso de una extremidad. Si la articulación no se ve, la manga/pierna sigue al cuerpo. */
function limbBones(base: Affine, gStart: Pt, gMid: Pt, gEnd: Pt, start: Joint | undefined, middle: Joint | undefined, end: Joint | undefined, k: number, twoPart: boolean): [Affine, Affine] {
  if (!seen(start) || !seen(middle)) return [base, base];
  const anchor = apply(base, gStart);
  const gUpper = sub(gMid, gStart);
  // La manga gira con el brazo, pero no más de MAX_SLEEVE_TURN respecto de cómo cae con el
  // torso: con el brazo en alto, una tela rígida "volando" se ve peor que una manga que se queda.
  const rest = sub(apply(base, gMid), anchor);
  const bUpper = limitTurn(rest, sub(middle.p, start.p), MAX_SLEEVE_TURN);
  // Manga corta: conserva el tamaño de la prenda. Manga larga: se estira lo justo para llegar al codo.
  const kUpper = twoPart ? clamp(dist(middle.p, start.p) / (dist(gMid, gStart) || 1), k * 0.75, k * 1.35) : k;
  const upper = similarity(gStart, gUpper, anchor, bUpper, kUpper);
  if (!twoPart || !seen(end)) return [upper, upper];
  const elbow = apply(upper, gMid);
  const kLower = clamp(dist(end.p, middle.p) / (dist(gEnd, gMid) || 1), k * 0.75, k * 1.35);
  return [upper, similarity(gMid, sub(gEnd, gMid), elbow, sub(end.p, middle.p), kLower)];
}

/**
 * Pose de una prenda de arriba (o vestido) para un cuerpo. Basta con ver los hombros: sin
 * caderas, la prenda cae en perpendicular a la línea de hombros con su largo real.
 */
export function upperPose(anchors: GarmentAnchors, width: number, height: number, body: Body, fit: Fit = NEUTRAL_FIT): Pose | null {
  const p = anchorPx(anchors, width, height);
  const rs = p['rightShoulder'];
  const ls = p['leftShoulder'];
  const down = downOf(body);
  if (!rs || !ls || !down || !body.leftShoulder || !body.rightShoulder) return null;
  const hem = p['leftHem'] && p['rightHem'] ? mid(p['leftHem'], p['rightHem']) : ([(rs[0] + ls[0]) / 2, height] as Pt);

  const bodyMid = mid(body.leftShoulder.p, body.rightShoulder.p);
  const half = scale(sub(body.leftShoulder.p, body.rightShoulder.p), (SHOULDER_SEAM * fit.width) / 2);
  const bls = add(bodyMid, half);
  const brs = sub(bodyMid, half);
  const k = dist(bls, brs) / (dist(ls, rs) || 1);
  const gMid = mid(ls, rs);
  const bHem = add(bodyMid, scale(down, dist(hem, gMid) * k * fit.length));
  const base = affineFrom3([ls, rs, hem], [bls, brs, bHem]);
  if (!base) return null;

  const twoPart = anchors.sleeve === 'long';
  const rc = p['rightCuff'] ?? rs;
  const lc = p['leftCuff'] ?? ls;
  const right = limbBones(base, rs, garmentElbow(anchors, rs, rc), rc, body.rightShoulder, body.rightElbow, body.rightWrist, k, twoPart);
  const left = limbBones(base, ls, garmentElbow(anchors, ls, lc), lc, body.leftShoulder, body.leftElbow, body.leftWrist, k, twoPart);
  return { base, right, left, scale: k };
}

/** Pose de un pantalón, short o falda: pelvis en las caderas y perneras siguiendo rodillas y tobillos. */
export function lowerPose(anchors: GarmentAnchors, width: number, height: number, body: Body, fit: Fit = NEUTRAL_FIT): Pose | null {
  const p = anchorPx(anchors, width, height);
  const rw = p['rightWaist'];
  const lw = p['leftWaist'];
  const cr = p['crotch'];
  const lh = body.leftHip;
  const rh = body.rightHip;
  if (!rw || !lw || !cr || !seen(lh) || !seen(rh)) return null;
  const hipMid = mid(lh.p, rh.p);
  const across = sub(lh.p, rh.p);
  const up = seen(body.leftShoulder) && seen(body.rightShoulder) ? unit(sub(mid(body.leftShoulder.p, body.rightShoulder.p), hipMid)) : ([0, -1] as Pt);
  const k = (dist(lh.p, rh.p) * HIP_CONTOUR * fit.width) / (dist(lw, rw) || 1);
  // La cintura de la prenda queda un poco por encima de las articulaciones de cadera.
  const waistMid = add(hipMid, scale(up, dist(lh.p, rh.p) * 0.42));
  const half = scale(unit(across), (dist(lw, rw) * k) / 2);
  const blw = add(waistMid, half);
  const brw = sub(waistMid, half);
  const gWaist = mid(lw, rw);
  const bCrotch = add(waistMid, scale(up, -dist(cr, gWaist) * k * fit.length));
  const base = affineFrom3([lw, rw, cr], [blw, brw, bCrotch]);
  if (!base) return null;
  if (anchors.kind === 'skirt') return { base, right: [base, base], left: [base, base], scale: k };

  const legs = (side: 'left' | 'right'): [Affine, Affine] => {
    const waist = side === 'left' ? lw : rw;
    const knee = p[`${side}Knee`];
    const ankle = p[`${side}Ankle`];
    if (!knee || !ankle) return [base, base];
    return limbBones(base, hipJoint(waist, cr), knee, ankle, body[`${side}Hip`], body[`${side}Knee`], body[`${side}Ankle`], k, true);
  };
  return { base, right: legs('right'), left: legs('left'), scale: k };
}

/**
 * Calzado y accesorios: una sola semejanza que coloca la pieza entera (sin malla de huesos).
 * Gorra sobre la cabeza, bufanda al cuello, bolso a la altura de la cadera, calzado en los tobillos.
 */
export function placementPose(anchors: GarmentAnchors, style: string | undefined, width: number, height: number, body: Body): Pose | null {
  const box = (from: Pt, dirFrom: Pt, to: Pt, dirTo: Pt, k: number): Pose => {
    const t = similarity(from, dirFrom, to, dirTo, k);
    return { base: t, right: [t, t], left: [t, t], scale: k };
  };
  const ls = body.leftShoulder;
  const rs = body.rightShoulder;
  if (anchors.kind === 'footwear') {
    const la = body.leftAnkle;
    const ra = body.rightAnkle;
    if (!seen(la) || !seen(ra)) return null;
    const span = Math.max(dist(la.p, ra.p) * 1.5, (seen(ls) && seen(rs) ? dist(ls.p, rs.p) : 0) * 0.9);
    // La suela va a la altura de las puntas de los pies (o algo bajo los tobillos si no se ven).
    const lf = body.leftFoot;
    const rf = body.rightFoot;
    const feet = seen(lf) && seen(rf) ? mid(lf.p, rf.p) : add(mid(la.p, ra.p), [0, span * 0.25]);
    const ground = Math.max(feet[1], mid(la.p, ra.p)[1]) + span * 0.04;
    return box([0, height], [1, 0], [feet[0] - span / 2, ground], [1, 0], span / width);
  }
  if (!seen(ls) || !seen(rs)) return null;
  const across = sub(ls.p, rs.p);
  const shoulderW = dist(ls.p, rs.p);
  if (style === 'cap') {
    const le = body.leftEar;
    const re = body.rightEar;
    if (!seen(le) || !seen(re)) return null;
    const earW = dist(le.p, re.p);
    const center = add(mid(le.p, re.p), [0, -earW * 0.55]);
    const k = (earW * 1.55) / width;
    return box([width / 2, height * 0.62], across, center, across, k);
  }
  if (style === 'scarf') {
    const k = (shoulderW * 0.75) / width;
    const neck = add(mid(ls.p, rs.p), [0, -shoulderW * 0.12]);
    return box([width / 2, 0], [1, 0], neck, across, k);
  }
  // Bolso: colgado a la altura de la cadera derecha (izquierda de la imagen).
  const hip = seen(body.rightHip) ? body.rightHip.p : add(rs.p, [0, shoulderW * 1.2]);
  const k = (shoulderW * 0.55) / width;
  return box([width / 2, 0], [1, 0], add(hip, [-shoulderW * 0.35, -shoulderW * 0.15]), [1, 0], k);
}

export function poseFor(anchors: GarmentAnchors, style: string | undefined, width: number, height: number, body: Body, fit: Fit = NEUTRAL_FIT): Pose | null {
  if (anchors.kind === 'upper') return upperPose(anchors, width, height, body, fit);
  if (anchors.kind === 'lower' || anchors.kind === 'skirt') return lowerPose(anchors, width, height, body, fit);
  return placementPose(anchors, style, width, height, body);
}

/** Orden de capas al vestir varias prendas a la vez: lo de abajo primero. */
export const LAYER_ORDER: Record<string, number> = { bottom: 0, footwear: 1, dress: 2, top: 3, outerwear: 4, accessory: 5 };
