import { LETTER_SIZES } from '@vestirse/shared-types';

/** Mínimo de tipos de cuerpo distintos en el catálogo "cuerpo similar al mío". */
export const MIN_BODY_TYPES = 10;

/**
 * Regla 4 (sección 4): el catálogo de cuerpos debe cubrir todo el rango de tallas.
 * Devuelve las tallas que quedarían sin ningún cuerpo de referencia.
 */
export function missingSizes(typicalSizes: string[]): string[] {
  const present = new Set(typicalSizes);
  return LETTER_SIZES.filter((s) => !present.has(s));
}

export function coverageViolations(bodies: { typicalSize: string; bodyTypeTag: string }[]): string[] {
  const problems: string[] = [];
  const missing = missingSizes(bodies.map((b) => b.typicalSize));
  if (missing.length) problems.push(`sin cuerpo de referencia para: ${missing.join(', ')}`);
  const types = new Set(bodies.map((b) => b.bodyTypeTag)).size;
  if (types < MIN_BODY_TYPES) problems.push(`solo ${types} tipos de cuerpo (mínimo ${MIN_BODY_TYPES})`);
  return problems;
}
