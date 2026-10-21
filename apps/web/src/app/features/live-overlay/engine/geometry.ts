/** Utilidades 2D puras del motor de cámara. Sin DOM: todo se prueba con vitest. */

export type Pt = [number, number];

/** Matriz afín [a, b, c, d, e, f]: x' = a·x + c·y + e ; y' = b·x + d·y + f (formato de canvas). */
export type Affine = [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const len = (a: Pt): number => Math.hypot(a[0], a[1]);
export const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Pt, b: Pt): number => a[0] * b[1] - a[1] * b[0];
export const unit = (a: Pt): Pt => {
  const l = len(a);
  return l < 1e-9 ? [0, 1] : [a[0] / l, a[1] / l];
};
export const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);

/** Gira `from` hacia `to` como mucho `max` radianes; conserva el largo de `to`. */
export function limitTurn(from: Pt, to: Pt, max: number): Pt {
  const turn = Math.atan2(cross(from, to), dot(from, to));
  if (Math.abs(turn) <= max) return to;
  const r = Math.sign(turn) * max;
  const [ux, uy] = unit(from);
  const l = len(to);
  return [(ux * Math.cos(r) - uy * Math.sin(r)) * l, (ux * Math.sin(r) + uy * Math.cos(r)) * l];
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}

export function apply([a, b, c, d, e, f]: Affine, [x, y]: Pt): Pt {
  return [a * x + c * y + e, b * x + d * y + f];
}

/** Transformación afín que lleva tres puntos de origen a tres de destino (null si son colineales). */
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

/**
 * Semejanza (giro + escala uniforme + traslación) que lleva `from` a `to` y alinea la
 * dirección `dirFrom` con `dirTo`, escalando por `k`. Es el "hueso" de una manga o pierna:
 * la tela gira con el brazo sin estirarse de lado.
 */
export function similarity(from: Pt, dirFrom: Pt, to: Pt, dirTo: Pt, k: number): Affine {
  const angle = Math.atan2(dirTo[1], dirTo[0]) - Math.atan2(dirFrom[1], dirFrom[0]);
  const cos = Math.cos(angle) * k;
  const sin = Math.sin(angle) * k;
  // x' = cos·x − sin·y + e ; y' = sin·x + cos·y + f
  const e = to[0] - (cos * from[0] - sin * from[1]);
  const f = to[1] - (sin * from[0] + cos * from[1]);
  return [cos, sin, -sin, cos, e, f];
}

/** Distancia con signo de p a la recta a→b (positiva a la izquierda del sentido a→b en coordenadas de pantalla). */
export function signedDistance(p: Pt, a: Pt, b: Pt): number {
  return cross(sub(b, a), sub(p, a)) / (dist(a, b) || 1e-9);
}

/** Proyección normalizada de p sobre el segmento a→b (0 en a, 1 en b; sin recortar). */
export function along(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  return dot(sub(p, a), ab) / (dot(ab, ab) || 1e-9);
}

/** ¿Está p dentro del polígono convexo o cóncavo `poly`? (par-impar) */
export function inPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

/** Distancia de p al segmento a→b. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  return dist(p, lerp(a, b, clamp(along(p, a, b), 0, 1)));
}
