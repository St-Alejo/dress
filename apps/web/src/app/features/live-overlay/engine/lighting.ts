/**
 * Ganancia de color para que la prenda tenga la luz de la escena: las fotos de catálogo
 * están hechas con luz de estudio y, sin esto, la prenda brilla más que la persona en una
 * habitación en penumbra (o tiene otro tono con luz cálida).
 *
 * `rgba` es una miniatura del fotograma (p. ej. 16×16). Se compara su luminancia media con
 * la de referencia de una foto de estudio y se aplica solo una parte de la diferencia, para
 * que la prenda conserve su color real.
 */
const REFERENCE_LUMA = 0.5;
const STRENGTH = 0.65;
const TINT = 0.22;

export function sceneGain(rgba: Uint8ClampedArray | Uint8Array): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = rgba.length / 4;
  if (!n) return [1, 1, 1];
  for (let i = 0; i < rgba.length; i += 4) {
    r += rgba[i];
    g += rgba[i + 1];
    b += rgba[i + 2];
  }
  r /= n * 255;
  g /= n * 255;
  b /= n * 255;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma < 1e-3) return [0.55, 0.55, 0.55];
  const exposure = Math.min(Math.max(1 + (luma / REFERENCE_LUMA - 1) * STRENGTH, 0.55), 1.12);
  const tint = (c: number) => 1 + (c / luma - 1) * TINT;
  const clampGain = (x: number) => Math.round(Math.min(Math.max(x, 0.45), 1.2) * 1000) / 1000;
  return [clampGain(exposure * tint(r)), clampGain(exposure * tint(g)), clampGain(exposure * tint(b))];
}

/** Interpolación suave entre la ganancia anterior y la nueva (evita parpadeos). */
export function easeGain(prev: [number, number, number], next: [number, number, number], k = 0.15): [number, number, number] {
  return [prev[0] + (next[0] - prev[0]) * k, prev[1] + (next[1] - prev[1]) * k, prev[2] + (next[2] - prev[2]) * k];
}
