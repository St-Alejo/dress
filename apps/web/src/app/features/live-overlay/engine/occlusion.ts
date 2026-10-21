import type { Body, Joint } from './rig';
import { type Pt, add, dist, distToSegment, inPolygon, lerp, mid, scale, sub } from './geometry';

/** Clases de `selfie_multiclass_256x256` (MediaPipe). */
export const SEG = { background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, others: 5 } as const;

const VISIBLE = 0.5;
const seen = (j?: Joint): j is Joint => !!j && j.v >= VISIBLE;

/**
 * Máscara de oclusión: qué píxeles de la persona deben quedar POR DELANTE de la prenda.
 *  - canal R: brazo (piel) que cruza por delante del torso → tapa el cuerpo de la prenda;
 *  - canal G: manos, cara y pelo → tapan toda la prenda, mangas incluidas (un cuello alto
 *    no se dibuja sobre la barbilla y la melena cae por delante de la ropa).
 *
 * Un brazo dentro del contorno del torso está por delante (de frente a la cámara no puede
 * estar detrás); fuera del torso, la manga lo viste y no hay nada que tapar. Así, si la
 * persona lleva tirantes, su hombro no "atraviesa" la camisa: solo brazos y manos.
 *
 * `labels` es la máscara de categorías (w×h) de un fotograma reducido; `toCanvas` pasa de
 * px de esa máscara a px del lienzo. Devuelve RG intercalado (w×h×2) listo para una textura.
 */
export function occlusionMask(labels: Uint8Array, w: number, h: number, body: Body, toCanvas: (x: number, y: number) => Pt, out: Uint8Array = new Uint8Array(w * h * 2)): Uint8Array {
  out.fill(0);
  const ls = body.leftShoulder;
  const rs = body.rightShoulder;
  if (!seen(ls) || !seen(rs)) return out;
  const shoulderW = dist(ls.p, rs.p);
  const lh = seen(body.leftHip) ? body.leftHip.p : add(ls.p, [0, shoulderW * 1.5]);
  const rh = seen(body.rightHip) ? body.rightHip.p : add(rs.p, [0, shoulderW * 1.5]);
  // Contorno del torso un poco más ancho que las articulaciones.
  const c = mid(mid(ls.p, rs.p), mid(lh, rh));
  const grow = (p: Pt) => add(c, scale(sub(p, c), 1.18));
  const torso: Pt[] = [grow(rs.p), grow(ls.p), grow(lh), grow(rh)];

  const arms: [Pt, Pt][] = [];
  const hands: [Pt, Pt][] = [];
  for (const side of ['left', 'right'] as const) {
    const s = body[`${side}Shoulder`];
    const e = body[`${side}Elbow`];
    const wr = body[`${side}Wrist`];
    // Solo la mitad baja del brazo: junto al hombro, la piel es la del propio hombro (tirantes), no un brazo cruzado.
    if (seen(s) && seen(e)) arms.push([lerp(s.p, e.p, 0.5), e.p]);
    if (seen(e) && seen(wr)) {
      arms.push([e.p, wr.p]);
      // La mano sigue al antebrazo más allá de la muñeca.
      hands.push([wr.p, add(wr.p, scale(sub(wr.p, e.p), 0.55))]);
    }
  }
  const armR = shoulderW * 0.2;
  const handR = shoulderW * 0.2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const label = labels[i];
      if (label === SEG.faceSkin || label === SEG.hair) {
        out[i * 2 + 1] = 255;
        continue;
      }
      if (label !== SEG.bodySkin) continue;
      const p = toCanvas(x + 0.5, y + 0.5);
      if (hands.some(([a, b]) => distToSegment(p, a, b) < handR)) out[i * 2 + 1] = 255;
      if (inPolygon(p, torso) && arms.some(([a, b]) => distToSegment(p, a, b) < armR)) out[i * 2] = 255;
    }
  }
  return out;
}

