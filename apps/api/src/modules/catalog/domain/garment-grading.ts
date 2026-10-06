import { LETTER_SIZES, type FitIntent, type GarmentDims } from '@vestirse/shared-types';

type Range = [number, number];

/** Medidas CORPORALES de referencia por talla alfabética (cm). */
export const LETTER_BODY: Record<string, { chest: Range; waist: Range; hip: Range }> = {
  XS: { chest: [78, 84], waist: [60, 66], hip: [84, 90] },
  S: { chest: [85, 91], waist: [67, 73], hip: [91, 97] },
  M: { chest: [92, 99], waist: [74, 81], hip: [98, 104] },
  L: { chest: [100, 107], waist: [82, 89], hip: [105, 111] },
  XL: { chest: [108, 115], waist: [90, 98], hip: [112, 118] },
  XXL: { chest: [116, 123], waist: [99, 107], hip: [119, 125] },
  '3XL': { chest: [124, 131], waist: [108, 116], hip: [126, 132] },
  '4XL': { chest: [132, 140], waist: [117, 126], hip: [133, 140] },
};

/**
 * Especificación de patronaje por estilo: holgura de diseño sobre el cuerpo y
 * largos de la talla M con su escalado por talla. Valores típicos de la industria.
 */
interface StyleSpec extends FitIntent {
  lengthM?: number;
  lengthStep?: number;
  sleeveM?: number;
  sleeveStep?: number;
  inseam?: number;
}

export const STYLE_SPEC: Record<string, StyleSpec> = {
  tshirt: { chestEaseCm: 10, lengthM: 70, lengthStep: 2, sleeveM: 20, sleeveStep: 0.5 },
  shirt: { chestEaseCm: 12, lengthM: 74, lengthStep: 2, sleeveM: 62, sleeveStep: 1.5 },
  sweater: { chestEaseCm: 14, lengthM: 66, lengthStep: 2, sleeveM: 61, sleeveStep: 1.5 },
  hoodie: { chestEaseCm: 20, lengthM: 70, lengthStep: 2, sleeveM: 63, sleeveStep: 1.5 },
  jacket: { chestEaseCm: 16, hipEaseCm: 14, lengthM: 64, lengthStep: 2, sleeveM: 63, sleeveStep: 1.5 },
  coat: { chestEaseCm: 18, hipEaseCm: 16, lengthM: 100, lengthStep: 2.5, sleeveM: 64, sleeveStep: 1.5 },
  'dress-a': { chestEaseCm: 8, waistEaseCm: 6, hipEaseCm: 30, lengthM: 98, lengthStep: 1.5 },
  'dress-wrap': { chestEaseCm: 6, waistEaseCm: 6, hipEaseCm: 12, lengthM: 102, lengthStep: 1.5, sleeveM: 30, sleeveStep: 0.5 },
  jeans: { waistEaseCm: 2, hipEaseCm: 5, inseam: 78 },
  trousers: { waistEaseCm: 3, hipEaseCm: 10, inseam: 79 },
  shorts: { waistEaseCm: 3, hipEaseCm: 8, inseam: 13 },
  skirt: { waistEaseCm: 2, hipEaseCm: 14, lengthM: 70, lengthStep: 1 },
};

export interface BodyRanges {
  size: string;
  chest?: Range;
  waist?: Range;
  hip?: Range;
}

const mid = (r?: Range) => (r ? (r[0] + r[1]) / 2 : undefined);
const round = (n: number) => Math.round(n * 2) / 2;

export function fitIntentFor(style: string): FitIntent | undefined {
  const s = STYLE_SPEC[style];
  if (!s) return undefined;
  const intent: FitIntent = {};
  if (s.chestEaseCm !== undefined) intent.chestEaseCm = s.chestEaseCm;
  if (s.waistEaseCm !== undefined) intent.waistEaseCm = s.waistEaseCm;
  if (s.hipEaseCm !== undefined) intent.hipEaseCm = s.hipEaseCm;
  return intent;
}

/**
 * Deriva las medidas de la prenda para cada talla: contorno corporal medio de la
 * talla + holgura del estilo, y largos escalados desde la talla M.
 */
export function gradeGarment(style: string, entries: BodyRanges[]): (GarmentDims | undefined)[] {
  const spec = STYLE_SPEC[style];
  if (!spec) return entries.map(() => undefined);
  const mIndex = Math.max(0, entries.findIndex((e) => e.size === 'M'));
  const refIndex = entries.some((e) => e.size === 'M') ? mIndex : Math.floor((entries.length - 1) / 2);

  return entries.map((e, i) => {
    const letter = (LETTER_SIZES as readonly string[]).includes(e.size) ? LETTER_BODY[e.size] : undefined;
    const chest = mid(e.chest) ?? mid(letter?.chest);
    const waist = mid(e.waist) ?? mid(letter?.waist);
    const hip = mid(e.hip) ?? mid(letter?.hip);
    const step = i - refIndex;
    const dims: GarmentDims = {};
    if (spec.chestEaseCm !== undefined && chest !== undefined) dims.chestCm = round(chest + spec.chestEaseCm);
    if (spec.waistEaseCm !== undefined && waist !== undefined) dims.waistCm = round(waist + spec.waistEaseCm);
    if (spec.hipEaseCm !== undefined && hip !== undefined) dims.hipCm = round(hip + spec.hipEaseCm);
    if (spec.lengthM !== undefined) dims.lengthCm = round(spec.lengthM + step * (spec.lengthStep ?? 0));
    if (spec.sleeveM !== undefined) dims.sleeveCm = round(spec.sleeveM + step * (spec.sleeveStep ?? 0));
    if (spec.inseam !== undefined) dims.inseamCm = spec.inseam;
    return Object.keys(dims).length ? dims : undefined;
  });
}
