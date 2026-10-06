import type {
  EaseLabel,
  EstimatedBody,
  FitAnalysis,
  FitIntent,
  FitVerdict,
  GarmentCategory,
  GarmentDims,
  GarmentItem,
  HemLandmark,
  LengthLabel,
  SizeChartEntry,
  SleeveLandmark,
} from '@vestirse/shared-types';
import { ARM_FRACTION, BODY_LANDMARKS as L } from './body-estimator';

/** Estatura del cuerpo de referencia sobre el que la marca diseña la talla de referencia. */
export const REFERENCE_HEIGHT_CM = 172;

/** Holgura de diseño por defecto si la prenda no la declara. */
const DEFAULT_INTENT: Record<GarmentCategory, FitIntent> = {
  top: { chestEaseCm: 10 },
  outerwear: { chestEaseCm: 16, hipEaseCm: 14 },
  dress: { chestEaseCm: 8, waistEaseCm: 8, hipEaseCm: 12 },
  bottom: { waistEaseCm: 2, hipEaseCm: 6 },
  footwear: {},
  accessory: {},
};

/** Cuánto puede quedar por debajo del contorno según elasticidad antes de ser "ajustada de más". */
const STRETCH_ALLOWANCE: Record<GarmentItem['stretch'], number> = { none: 0, low: 2, medium: 5, high: 10 };

export interface AnalyzeInput {
  body: EstimatedBody;
  category: GarmentCategory;
  sizeChart: SizeChartEntry[];
  size: string;
  stretch?: GarmentItem['stretch'];
  fitIntent?: FitIntent;
}

/**
 * Análisis determinista de ajuste por talla: compara las medidas REALES de la
 * prenda con el cuerpo (medido o estimado). Es la fuente de verdad para "¿me
 * queda esta talla?"; la imagen generada por IA solo la ilustra.
 */
export class FitAnalyzer {
  analyze(input: AnalyzeInput): FitAnalysis | null {
    const entry = input.sizeChart.find((e) => e.size === input.size);
    const dims = entry?.garment;
    if (!dims) return null;
    const intent = { ...DEFAULT_INTENT[input.category], ...input.fitIntent };
    const allowance = STRETCH_ALLOWANCE[input.stretch ?? 'low'];
    const ref = referenceDims(input.sizeChart);
    const notes: string[] = [];

    const zones: FitAnalysis['zones'] = [];
    const zoneDefs = [
      { zone: 'chest' as const, body: input.body.chestCm, garment: dims.chestCm, intent: intent.chestEaseCm },
      { zone: 'waist' as const, body: input.body.waistCm, garment: dims.waistCm, intent: intent.waistEaseCm },
      { zone: 'hip' as const, body: input.body.hipCm, garment: dims.hipCm, intent: intent.hipEaseCm },
    ];
    for (const z of zoneDefs) {
      if (z.body === undefined || z.garment === undefined || z.intent === undefined) continue;
      const ease = round(z.garment - z.body);
      const label = easeLabel(ease, ease - z.intent, allowance);
      zones.push({ zone: z.zone, easeCm: ease, label });
      if (label !== 'regular') notes.push(`analysis.zone.${z.zone}.${label}`);
    }

    const H = input.body.heightCm;
    let length: FitAnalysis['length'];
    let sleeve: FitAnalysis['sleeve'];

    if (input.category === 'bottom' && dims.inseamCm !== undefined) {
      const end = L.crotch + dims.inseamCm / H;
      length = { label: pantsLengthLabel(end), landmark: hemLandmark(end) };
      if (length.label === 'long' || length.label === 'too-long') notes.push('analysis.note.hemmable');
    } else if (dims.lengthCm !== undefined && ref?.lengthCm !== undefined) {
      const start = input.category === 'bottom' ? L.waist : L.hps;
      const end = start + dims.lengthCm / H;
      const designed = start + ref.lengthCm / REFERENCE_HEIGHT_CM;
      length = { label: deltaLabel(end - designed, 0.025, 0.06), landmark: hemLandmark(end) };
    }
    if (length) notes.push(`analysis.hem.${length.landmark}`);

    if (dims.sleeveCm !== undefined && ref?.sleeveCm !== undefined && dims.sleeveCm > 0) {
      const armFrac = dims.sleeveCm / (ARM_FRACTION * H);
      const designed = ref.sleeveCm / (ARM_FRACTION * REFERENCE_HEIGHT_CM);
      sleeve = { label: deltaLabel(armFrac - designed, 0.08, 0.18), landmark: sleeveLandmark(armFrac) };
      notes.push(`analysis.sleeve.${sleeve.landmark}`);
    }

    return {
      size: input.size,
      verdict: verdictOf(zones, length, sleeve, input.category),
      zones,
      length,
      sleeve,
      notes,
      bodyEstimated: input.body.estimated,
    };
  }

  /** Analiza todas las tallas que tienen medidas de prenda. */
  analyzeAll(input: Omit<AnalyzeInput, 'size'>): FitAnalysis[] {
    return input.sizeChart
      .map((e) => this.analyze({ ...input, size: e.size }))
      .filter((a): a is FitAnalysis => a !== null);
  }
}

/** Talla de diseño: "M" si existe; si no, la talla central de la tabla. */
function referenceDims(chart: SizeChartEntry[]): GarmentDims | undefined {
  const withDims = chart.filter((e) => e.garment);
  const m = withDims.find((e) => e.size === 'M');
  return (m ?? withDims[Math.floor((withDims.length - 1) / 2)])?.garment;
}

function easeLabel(ease: number, deviation: number, allowance: number): EaseLabel {
  if (ease < -allowance) return 'tight';
  if (deviation < -5) return 'fitted';
  if (deviation <= 6) return 'regular';
  if (deviation <= 14) return 'loose';
  return 'oversized';
}

function deltaLabel(delta: number, small: number, big: number): LengthLabel {
  if (delta < -big) return 'too-short';
  if (delta < -small) return 'short';
  if (delta <= small) return 'as-designed';
  if (delta <= big) return 'long';
  return 'too-long';
}

function pantsLengthLabel(end: number): LengthLabel {
  const d = end - L.ankle;
  if (d < -0.12) return 'too-short';
  if (d < -0.05) return 'short';
  if (d <= 0.035) return 'as-designed';
  if (d <= 0.06) return 'long';
  return 'too-long';
}

function hemLandmark(y: number): HemLandmark {
  if (y < 0.45) return 'waist';
  if (y < 0.515) return 'hip';
  if (y < 0.58) return 'upper-thigh';
  if (y < 0.68) return 'mid-thigh';
  if (y < 0.785) return 'knee';
  if (y < 0.9) return 'mid-calf';
  if (y < 0.98) return 'ankle';
  return 'floor';
}

function sleeveLandmark(armFrac: number): SleeveLandmark {
  if (armFrac < 0.45) return 'upper-arm';
  if (armFrac < 0.62) return 'elbow';
  if (armFrac < 0.9) return 'forearm';
  if (armFrac < 1.08) return 'wrist';
  return 'over-hand';
}

function verdictOf(
  zones: FitAnalysis['zones'],
  length: FitAnalysis['length'],
  sleeve: FitAnalysis['sleeve'],
  category: GarmentCategory,
): FitVerdict {
  if (zones.some((z) => z.label === 'tight')) return 'too-small';
  if (category !== 'bottom' && length?.label === 'too-short') return 'too-small';
  const oversizedWaist = category === 'bottom' && zones.some((z) => z.zone === 'waist' && (z.label === 'oversized' || z.label === 'loose'));
  if (zones.some((z) => z.label === 'oversized') || oversizedWaist) return 'too-large';
  if (length?.label === 'too-long' && category !== 'bottom') return 'too-large';
  if (sleeve?.label === 'too-long') return 'too-large';
  if (zones.some((z) => z.label === 'loose') || length?.label === 'long' || length?.label === 'too-long' || sleeve?.label === 'long') {
    return 'large';
  }
  return 'good';
}

const round = (n: number) => Math.round(n * 10) / 10;
