import type { GarmentItem, PoseRatios } from '@vestirse/shared-types';
import { dist } from './engine/geometry';
import type { Body, Joint } from './engine/rig';
import { canWear } from './engine/tryon-scene';

export type FitHint = 'no-body' | 'too-far' | 'too-close' | 'show-hips' | 'show-legs' | 'show-feet' | 'show-head' | 'good';

const VISIBLE = 0.5;
const seen = (j?: Joint): j is Joint => !!j && j.v >= VISIBLE;

/** ¿Qué parte del cuerpo hace falta ver para vestir esta prenda? */
export type Needs = 'shoulders' | 'hips' | 'legs' | 'feet' | 'head';

export function needsFor(g: Pick<GarmentItem, 'category' | 'style'>): Needs {
  if (g.category === 'bottom') return g.style === 'skirt' ? 'hips' : 'legs';
  if (g.category === 'footwear') return 'feet';
  if (g.category === 'accessory' && g.style === 'cap') return 'head';
  return 'shoulders';
}

/** La cámara necesita el recorte de la prenda sola y sus anclas medidas. */
export function canOverlay(g: Pick<GarmentItem, 'images' | 'anchors'>): boolean {
  return canWear(g);
}

/** Guía conversacional de encuadre (paso 3): qué decirle a la persona. */
export function fitHintFor(body: Body | null, canvasWidth: number, needs: Needs = 'shoulders'): FitHint {
  const ls = body?.leftShoulder;
  const rs = body?.rightShoulder;
  if (needs === 'feet') {
    return seen(body?.leftAnkle) && seen(body?.rightAnkle) ? 'good' : body ? 'show-feet' : 'no-body';
  }
  if (!body || !seen(ls) || !seen(rs)) return 'no-body';
  const rel = dist(ls.p, rs.p) / canvasWidth;
  if (rel > 0.5) return 'too-close';
  if (rel < 0.08) return 'too-far';
  if (needs === 'head' && !(seen(body.leftEar) && seen(body.rightEar))) return 'show-head';
  if ((needs === 'hips' || needs === 'legs') && !(seen(body.leftHip) && seen(body.rightHip))) return 'show-hips';
  if (needs === 'legs' && !(seen(body.leftKnee) && seen(body.rightKnee))) return 'show-legs';
  return 'good';
}

/**
 * Relación hombros/caderas normalizada (1 ≈ proporción típica). Los keypoints de
 * cadera son centros articulares, más juntos que el contorno, por eso se divide
 * por la relación típica entre landmarks.
 */
export const TYPICAL_LANDMARK_RATIO = 1.45;
export function poseRatiosFrom(body: Body): PoseRatios | null {
  const { leftShoulder: ls, rightShoulder: rs, leftHip: lh, rightHip: rh } = body;
  if (!ls || !rs || !lh || !rh || Math.min(ls.v, rs.v, lh.v, rh.v) < 0.6) return null;
  const hips = dist(lh.p, rh.p);
  if (hips < 1) return null;
  return { shoulderToHipRatio: Math.round((dist(ls.p, rs.p) / hips / TYPICAL_LANDMARK_RATIO) * 100) / 100 };
}
