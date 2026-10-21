import type { Fit } from './rig';

/** Holgura visual por cada talla de diferencia con la recomendada (aprox. una talla = 4–6 cm de contorno). */
export const WIDTH_PER_SIZE = 0.055;
export const LENGTH_PER_SIZE = 0.025;
const MAX_STEPS = 3;

/**
 * Cómo se ve una talla en la cámara respecto de la recomendada: una talla más ensancha la
 * prenda (no al cuerpo) y la alarga un poco; una menos la estrecha. Es una aproximación
 * visual para comparar "M frente a L"; la recomendación real sale del motor de tallas.
 */
export function fitForSize(sizes: string[], recommended: string | undefined, chosen: string | undefined): Fit {
  const r = recommended ? sizes.indexOf(recommended) : -1;
  const c = chosen ? sizes.indexOf(chosen) : -1;
  if (r < 0 || c < 0) return { width: 1, length: 1 };
  const steps = Math.max(-MAX_STEPS, Math.min(MAX_STEPS, c - r));
  return { width: 1 + steps * WIDTH_PER_SIZE, length: 1 + steps * LENGTH_PER_SIZE };
}
