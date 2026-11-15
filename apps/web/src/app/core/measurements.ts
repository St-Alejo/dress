import type { BodyEstimate, BodyMeasurements, ProfileMeasure, SavedProfile } from '@vestirse/shared-types';

const CONTOURS = ['chestCm', 'waistCm', 'hipCm'] as const;

/**
 * Junta lo que midió la IA con lo que ya había. Lo escrito por la persona manda: solo se
 * rellenan huecos, o se reemplazan medidas que ya eran estimadas. Si alguna medida usada
 * es estimada, el conjunto se marca como tal (el motor de tallas la pesa menos).
 */
export function mergeAiMeasurements(current: BodyMeasurements | null, estimate: BodyEstimate, heightCm: number): BodyMeasurements {
  const typed = current && !current.estimatedFromPose ? current : null;
  const next: BodyMeasurements = { heightCm };
  let usedAi = false;
  for (const key of CONTOURS) {
    const own = typed?.[key];
    const ai = estimate.usable ? estimate.measurements?.[key] : undefined;
    if (own !== undefined) next[key] = own;
    else if (ai !== undefined) {
      next[key] = ai;
      usedAi = true;
    }
  }
  if (usedAi) next.estimatedFromPose = true;
  return next;
}

/** Medidas del perfil guardado, tal como las usa el motor de tallas. */
export function profileMeasurements(p: SavedProfile): BodyMeasurements {
  const m: BodyMeasurements = { heightCm: p.heightCm };
  for (const key of CONTOURS) if (p[key] !== undefined) m[key] = p[key];
  if (CONTOURS.some((k) => p[k] !== undefined && p.aiFields.includes(k as ProfileMeasure))) m.estimatedFromPose = true;
  return m;
}
