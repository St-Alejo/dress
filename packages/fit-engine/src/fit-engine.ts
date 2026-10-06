import type {
  BodyProfile,
  EstimatedBody,
  FitAnalysis,
  FitConfidence,
  FitIntent,
  FitRecommendation,
  GarmentCategory,
  GarmentItem,
  PoseRatios,
  SizeChartEntry,
} from '@vestirse/shared-types';
import { BodyEstimator } from './body-estimator';
import { BrandCalibration } from './brand-calibration';
import { FitAnalyzer } from './fit-analysis';
import { SizeChart } from './size-chart';
import {
  GarmentMeasurementsStrategy,
  HeightOnlyStrategy,
  ManualMeasurementsStrategy,
  PoseRatioStrategy,
  type FitStrategy,
  type StrategyResult,
} from './strategies';

export interface FitInput {
  /** Estatura obligatoria; peso, silueta y medidas con cinta opcionales. */
  measurements: BodyProfile;
  sizeChart: SizeChartEntry[];
  category: GarmentCategory;
  stretch?: GarmentItem['stretch'];
  fitIntent?: FitIntent;
  poseRatios?: PoseRatios;
  calibration?: BrandCalibration;
}

/** Diferencia de puntaje bajo la cual se considera que la persona está "entre dos tallas". */
const BETWEEN_SIZES_MARGIN = 0.15;

/**
 * Track C. Combina estrategias ponderadas y produce una recomendación que
 * nunca es una certeza: siempre trae confianza y la base del cálculo.
 */
export class FitEngine {
  private readonly estimator = new BodyEstimator();
  private readonly analyzer = new FitAnalyzer();

  constructor(
    private readonly strategies: FitStrategy[] = [
      new GarmentMeasurementsStrategy(),
      new ManualMeasurementsStrategy(),
      new HeightOnlyStrategy(),
      new PoseRatioStrategy(),
    ],
  ) {}

  /** Cuerpo usado para el análisis (medidas con cinta o estimación por estatura y peso). */
  bodyFor(profile: BodyProfile): EstimatedBody {
    return this.estimator.estimate(profile);
  }

  /** Análisis por talla: cómo le queda cada talla a este cuerpo ("medirse las prendas por talla"). */
  analyze(input: Omit<FitInput, 'calibration' | 'poseRatios'>): FitAnalysis[] {
    return this.analyzer.analyzeAll({
      body: this.bodyFor(input.measurements),
      category: input.category,
      sizeChart: input.sizeChart,
      stretch: input.stretch,
      fitIntent: input.fitIntent,
    });
  }

  recommend(input: FitInput): FitRecommendation {
    if (!(input.measurements.heightCm > 0)) throw new Error('La altura es obligatoria para estimar la talla');
    const chart = new SizeChart(input.sizeChart);
    const ctx = {
      chart,
      measurements: input.measurements,
      category: input.category,
      poseRatios: input.poseRatios,
      body: this.bodyFor(input.measurements),
      stretch: input.stretch,
      fitIntent: input.fitIntent,
    };
    const results = this.strategies
      .map((s) => s.evaluate(ctx))
      .filter((r): r is StrategyResult => r !== null);

    // La pose sola nunca decide (solo refuerza).
    const primary = results.filter((r) => r.evidence !== 'pose');
    if (primary.length === 0) {
      return this.insufficientData(chart);
    }

    const ranked = this.rank(chart, results);
    let [best, second] = ranked;
    const bodyKnown = results.some((r) => r.evidence === 'measured' || r.evidence === 'estimated');
    // Con contornos (medidos o estimados), la tabla genérica por altura es ruido: no se muestra como base.
    const basis = unique(results.flatMap((r) => r.basis)).filter((b) => !(bodyKnown && b === 'fit.basis.genericChart'));

    let alternativeSize: string | undefined;
    if (second && best.score - second.score < BETWEEN_SIZES_MARGIN) {
      // Entre dos tallas: con poco stretch conviene la mayor; con mucho, la menor.
      const [smaller, larger] = [best, second].sort((a, b) => a.index - b.index);
      const preferLarger = input.stretch !== 'high' && input.stretch !== 'medium';
      best = preferLarger ? larger : smaller;
      alternativeSize = (preferLarger ? smaller : larger).size;
      basis.push(preferLarger ? 'fit.basis.betweenSizesLowStretch' : 'fit.basis.betweenSizesStretchy');
    }

    let index = best.index;
    const offset = input.calibration?.offset ?? 0;
    if (offset !== 0) {
      index = Math.max(0, Math.min(chart.sizes.length - 1, index + offset));
      basis.push(offset > 0 ? 'fit.basis.brandRunsSmall' : 'fit.basis.brandRunsLarge');
    }

    const outsideChart = results.some((r) => r.outsideChart);
    if (outsideChart) basis.push('fit.basis.outsideChart');

    return {
      recommendedSize: chart.at(index).size,
      confidence: this.confidence(results, chart, outsideChart),
      basis,
      ...(alternativeSize && alternativeSize !== chart.at(index).size ? { alternativeSize } : {}),
    };
  }

  /** La persona siempre puede corregir la talla (regla 5). Solo se valida que exista en la tabla. */
  applyOverride(rec: FitRecommendation, size: string, sizeChart: SizeChartEntry[]): FitRecommendation {
    if (!new SizeChart(sizeChart).has(size)) throw new Error(`La talla ${size} no existe en esta prenda`);
    return { ...rec, userOverride: size };
  }

  private rank(chart: SizeChart, results: StrategyResult[]) {
    const totalWeight = results.reduce((acc, r) => acc + r.weight, 0);
    return chart.sizes
      .map((size, index) => ({
        size,
        index,
        score: results.reduce((acc, r) => acc + (r.scores[size] ?? 0) * r.weight, 0) / totalWeight,
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
  }

  private confidence(results: StrategyResult[], chart: SizeChart, outsideChart: boolean): FitConfidence {
    if (outsideChart) return 'low';
    const measured = results.some((r) => r.evidence === 'measured');
    const garmentBased = results.some((r) => r.basis.includes('fit.basis.garmentMeasurements'));
    // Contornos medidos con cinta + tabla detallada (del cuerpo o de la prenda) → alta.
    // Estimados por estatura y peso → media: es una aproximación y así se dice.
    if (measured && (chart.isDetailed() || garmentBased)) return 'high';
    return 'medium';
  }

  private insufficientData(chart: SizeChart): FitRecommendation {
    // Se muestra igual, marcado como baja confianza: la talla central es el punto de partida menos sesgado.
    return {
      recommendedSize: chart.at(Math.floor((chart.sizes.length - 1) / 2)).size,
      confidence: 'low',
      basis: ['fit.basis.insufficientData'],
    };
  }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
