import type { GarmentCategory, OverlayAnchors, PoseRatios } from '@vestirse/shared-types';

export type Pt = [number, number];

/** Puntos de pose relevantes, en px del lienzo. Solo números: nunca píxeles de la imagen. */
export interface PosePoints {
  leftShoulder: Pt;
  rightShoulder: Pt;
  leftHip: Pt;
  rightHip: Pt;
  /** Visibilidad mínima de hombros y caderas (0..1). */
  shouldersVisible: number;
  hipsVisible: number;
}

export type FitHint = 'no-body' | 'too-far' | 'too-close' | 'show-hips' | 'good';

/** Matriz afín [a, b, c, d, e, f] (formato de CanvasRenderingContext2D.setTransform). */
export type Affine = [number, number, number, number, number, number];

const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/**
 * Transformación afín que lleva tres puntos de origen a tres de destino.
 * Resuelve x' = a·x + c·y + e ; y' = b·x + d·y + f.
 */
export function affineFrom3(src: [Pt, Pt, Pt], dst: [Pt, Pt, Pt]): Affine | null {
  const [[x1, y1], [x2, y2], [x3, y3]] = src;
  const det = x1 * (y2 - y3) - x2 * (y1 - y3) + x3 * (y1 - y2);
  if (Math.abs(det) < 1e-9) return null;
  const solve = (v1: number, v2: number, v3: number): [number, number, number] => [
    (v1 * (y2 - y3) - v2 * (y1 - y3) + v3 * (y1 - y2)) / det,
    (x1 * (v2 - v3) - x2 * (v1 - v3) + x3 * (v1 - v2)) / det,
    (x1 * (y2 * v3 - y3 * v2) - x2 * (y1 * v3 - y3 * v1) + x3 * (y1 * v2 - y2 * v1)) / det,
  ];
  const [a, c, e] = solve(dst[0][0], dst[1][0], dst[2][0]);
  const [b, d, f] = solve(dst[0][1], dst[1][1], dst[2][1]);
  return [a, b, c, d, e, f];
}

export function applyAffine([a, b, c, d, e, f]: Affine, [x, y]: Pt): Pt {
  return [a * x + c * y + e, b * x + d * y + f];
}

/** Categorías que se pueden superponer en vivo con anclas de hombros y caderas. */
export function supportsLiveOverlay(category: GarmentCategory): boolean {
  return category === 'top' || category === 'outerwear' || category === 'dress' || category === 'bottom';
}

/**
 * Warp afín por región (sección 7.1): alinea hombros y centro de cadera de la
 * imagen de la prenda con los keypoints detectados. Deliberadamente simple.
 */
export function overlayTransform(anchors: OverlayAnchors, pose: PosePoints): Affine | null {
  const src: [Pt, Pt, Pt] = [anchors.leftShoulder, anchors.rightShoulder, mid(anchors.leftHip, anchors.rightHip)];
  const dst: [Pt, Pt, Pt] = [pose.leftShoulder, pose.rightShoulder, mid(pose.leftHip, pose.rightHip)];
  return affineFrom3(src, dst);
}

/** Guía conversacional de encuadre (paso 3): qué decirle a la persona. */
export function fitHintFor(pose: PosePoints | null, canvasWidth: number): FitHint {
  if (!pose || pose.shouldersVisible < 0.5) return 'no-body';
  const shoulderWidth = Math.hypot(pose.leftShoulder[0] - pose.rightShoulder[0], pose.leftShoulder[1] - pose.rightShoulder[1]);
  const rel = shoulderWidth / canvasWidth;
  if (rel > 0.42) return 'too-close';
  if (rel < 0.1) return 'too-far';
  // El warp usa el centro de cadera como tercer ancla: sin caderas no hay alineación estable.
  if (pose.hipsVisible < 0.5) return 'show-hips';
  return 'good';
}

/**
 * Relación hombros/caderas normalizada (1 ≈ proporción típica). Los keypoints de
 * cadera son centros articulares, más juntos que el contorno, por eso se divide
 * por la relación típica entre landmarks.
 */
export const TYPICAL_LANDMARK_RATIO = 1.45;
export function poseRatiosFrom(pose: PosePoints): PoseRatios | null {
  if (pose.shouldersVisible < 0.6 || pose.hipsVisible < 0.6) return null;
  const shoulders = Math.hypot(pose.leftShoulder[0] - pose.rightShoulder[0], pose.leftShoulder[1] - pose.rightShoulder[1]);
  const hips = Math.hypot(pose.leftHip[0] - pose.rightHip[0], pose.leftHip[1] - pose.rightHip[1]);
  if (hips < 1) return null;
  return { shoulderToHipRatio: Math.round((shoulders / hips / TYPICAL_LANDMARK_RATIO) * 100) / 100 };
}
