import type { BodyProfile, EstimatedBody, Silhouette } from '@vestirse/shared-types';

/**
 * Posiciones verticales del cuerpo como fracción de la estatura, medidas desde la
 * coronilla. Son las mismas que usa el renderer de ilustraciones, así el análisis
 * y la vista previa coinciden.
 */
export const BODY_LANDMARKS = {
  /** Punto alto del hombro (junto al cuello): desde aquí se mide el largo de una prenda superior. */
  hps: 0.165,
  shoulder: 0.18,
  elbow: 0.36,
  waist: 0.4,
  hip: 0.5,
  wrist: 0.5,
  crotch: 0.53,
  midThigh: 0.63,
  knee: 0.73,
  midCalf: 0.84,
  ankle: 0.955,
  floor: 1,
} as const;

/** Largo del brazo (hombro → muñeca) como fracción de la estatura. */
export const ARM_FRACTION = BODY_LANDMARKS.wrist - BODY_LANDMARKS.shoulder;

/**
 * Estima contornos a partir de estatura y peso.
 *
 * - Cintura: modelo NHANES del índice cintura/estatura
 *   WHtR = 1.271 + 0.00470·kg − 0.634·m (SMRT, PMC12914367), con un ajuste por
 *   silueta porque el modelo poblacional sobreestima la cintura en siluetas femeninas.
 * - Cadera y pecho: relaciones cintura/cadera y pecho/cadera según silueta, que
 *   varían suavemente con el IMC.
 *
 * Es una aproximación honesta: todo lo estimado se marca como tal y las medidas
 * con cinta siempre tienen prioridad. No existe ningún parámetro para "estilizar".
 */
export class BodyEstimator {
  static readonly WAIST_FACTOR: Record<Silhouette, number> = { feminine: 0.88, masculine: 1, neutral: 0.94 };

  estimate(profile: BodyProfile): EstimatedBody {
    const { heightCm, weightKg } = profile;
    if (!(heightCm > 0)) throw new Error('La estatura es obligatoria');
    const fullyMeasured = profile.chestCm !== undefined && profile.waistCm !== undefined && profile.hipCm !== undefined;

    if (!weightKg || weightKg <= 0) {
      // Sin peso no se inventan contornos: solo los medidos (si hay).
      return { heightCm, chestCm: profile.chestCm, waistCm: profile.waistCm, hipCm: profile.hipCm, estimated: false };
    }

    const silhouette = profile.silhouette ?? 'neutral';
    const m = heightCm / 100;
    const bmi = weightKg / (m * m);
    const whtr = 1.271 + 0.0047 * weightKg - 0.634 * m;
    const waistEst = whtr * heightCm * BodyEstimator.WAIST_FACTOR[silhouette];

    const whr = { feminine: 0.72 + 0.005 * (bmi - 18), masculine: 0.88 + 0.006 * (bmi - 22), neutral: 0.8 + 0.0055 * (bmi - 20) }[silhouette];
    const waist = profile.waistCm ?? waistEst;
    const hipEst = waist / whr;
    const hip = profile.hipCm ?? hipEst;
    const chestEst = { feminine: hip * 0.92, masculine: waist * 1.12, neutral: (hip * 0.92 + waist * 1.12) / 2 }[silhouette];

    return {
      heightCm,
      chestCm: round(profile.chestCm ?? chestEst),
      waistCm: round(waist),
      hipCm: round(hip),
      estimated: !fullyMeasured,
    };
  }
}

const round = (n: number) => Math.round(n * 10) / 10;
