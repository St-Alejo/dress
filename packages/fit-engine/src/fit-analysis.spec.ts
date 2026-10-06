import { describe, expect, it } from 'vitest';
import type { SizeChartEntry } from '@vestirse/shared-types';
import { BodyEstimator } from './body-estimator';
import { FitAnalyzer } from './fit-analysis';
import { FitEngine } from './fit-engine';

/** Camiseta: pecho de prenda = pecho corporal medio + 10 cm; largo +2 cm por talla desde M (70). */
const tee: SizeChartEntry[] = [
  { size: 'XS', chestCm: [78, 84], garment: { chestCm: 91, lengthCm: 66, sleeveCm: 19 } },
  { size: 'S', chestCm: [85, 91], garment: { chestCm: 98, lengthCm: 68, sleeveCm: 19.5 } },
  { size: 'M', chestCm: [92, 99], garment: { chestCm: 105.5, lengthCm: 70, sleeveCm: 20 } },
  { size: 'L', chestCm: [100, 107], garment: { chestCm: 113.5, lengthCm: 72, sleeveCm: 20.5 } },
  { size: 'XL', chestCm: [108, 115], garment: { chestCm: 121.5, lengthCm: 74, sleeveCm: 21 } },
  { size: 'XXL', chestCm: [116, 123], garment: { chestCm: 129.5, lengthCm: 76, sleeveCm: 21.5 } },
];

const jeans: SizeChartEntry[] = [
  { size: '36', waistCm: [64, 69], hipCm: [88, 93], garment: { waistCm: 68.5, hipCm: 94.5, inseamCm: 78 } },
  { size: '38', waistCm: [70, 75], hipCm: [94, 99], garment: { waistCm: 74.5, hipCm: 100.5, inseamCm: 78 } },
  { size: '40', waistCm: [76, 81], hipCm: [100, 105], garment: { waistCm: 80.5, hipCm: 106.5, inseamCm: 78 } },
  { size: '44', waistCm: [88, 93], hipCm: [112, 117], garment: { waistCm: 92.5, hipCm: 118.5, inseamCm: 78 } },
];

const estimator = new BodyEstimator();
const analyzer = new FitAnalyzer();
const person165 = estimator.estimate({ heightCm: 165, weightKg: 58, silhouette: 'feminine' });

describe('BodyEstimator', () => {
  it('estima contornos plausibles con estatura y peso', () => {
    expect(person165.waistCm).toBeGreaterThan(66);
    expect(person165.waistCm).toBeLessThan(78);
    expect(person165.hipCm).toBeGreaterThan(88);
    expect(person165.hipCm).toBeLessThan(102);
    expect(person165.chestCm).toBeGreaterThan(82);
    expect(person165.chestCm).toBeLessThan(96);
    expect(person165.estimated).toBe(true);
  });

  it('a más peso, contornos mayores (monótono)', () => {
    const light = estimator.estimate({ heightCm: 170, weightKg: 55 });
    const heavy = estimator.estimate({ heightCm: 170, weightKg: 95 });
    expect(heavy.waistCm!).toBeGreaterThan(light.waistCm!);
    expect(heavy.hipCm!).toBeGreaterThan(light.hipCm!);
    expect(heavy.chestCm!).toBeGreaterThan(light.chestCm!);
  });

  it('las medidas con cinta tienen prioridad', () => {
    const b = estimator.estimate({ heightCm: 165, weightKg: 58, chestCm: 100, waistCm: 80, hipCm: 105 });
    expect(b).toMatchObject({ chestCm: 100, waistCm: 80, hipCm: 105, estimated: false });
  });

  it('sin peso no inventa contornos', () => {
    const b = estimator.estimate({ heightCm: 165 });
    expect(b.chestCm).toBeUndefined();
    expect(b.estimated).toBe(false);
  });

  it('no expone ningún parámetro para "estilizar" el cuerpo (regla 2)', () => {
    const names = Object.getOwnPropertyNames(BodyEstimator.prototype).concat(Object.keys(BodyEstimator));
    expect(names.filter((n) => /slim|thin|reshape|beautif|ideal/i.test(n))).toEqual([]);
  });
});

describe('FitAnalyzer — "si mido 1,65 una XL no me quedaría"', () => {
  it('XL en 1,65 m / 58 kg: demasiado grande, larga hasta medio muslo', () => {
    const a = analyzer.analyze({ body: person165, category: 'top', sizeChart: tee, size: 'XL', stretch: 'medium' })!;
    expect(a.verdict).toBe('too-large');
    expect(a.zones.find((z) => z.zone === 'chest')!.label).toBe('oversized');
    expect(a.length!.landmark).toBe('mid-thigh');
    expect(a.length!.label).toBe('long');
    expect(a.bodyEstimated).toBe(true);
  });

  it('S en el mismo cuerpo: le queda bien', () => {
    const a = analyzer.analyze({ body: person165, category: 'top', sizeChart: tee, size: 'S', stretch: 'medium' })!;
    expect(a.verdict).toBe('good');
    expect(a.zones[0].label).toBe('regular');
  });

  it('XS: ajustada de pecho', () => {
    const big = estimator.estimate({ heightCm: 165, weightKg: 75, silhouette: 'feminine' });
    const a = analyzer.analyze({ body: big, category: 'top', sizeChart: tee, size: 'XS', stretch: 'low' })!;
    expect(a.verdict).toBe('too-small');
  });

  it('la misma talla se ve distinta según la estatura (largo relativo)', () => {
    const tall = estimator.estimate({ heightCm: 190, weightKg: 85, silhouette: 'masculine' });
    const onTall = analyzer.analyze({ body: tall, category: 'top', sizeChart: tee, size: 'M' })!;
    const onShort = analyzer.analyze({ body: person165, category: 'top', sizeChart: tee, size: 'M' })!;
    expect(['short', 'too-short']).toContain(onTall.length!.label);
    expect(['as-designed', 'long']).toContain(onShort.length!.label);
  });

  it('pantalones: el largo se evalúa contra el tobillo y se sugiere bastear', () => {
    const a = analyzer.analyze({ body: person165, category: 'bottom', sizeChart: jeans, size: '38', stretch: 'low' })!;
    expect(['long', 'too-long']).toContain(a.length!.label);
    expect(a.notes).toContain('analysis.note.hemmable');
  });

  it('pantalones: cintura muy grande = se cae (demasiado grande)', () => {
    const a = analyzer.analyze({ body: person165, category: 'bottom', sizeChart: jeans, size: '44' })!;
    expect(a.verdict).toBe('too-large');
  });

  it('sin medidas de prenda no inventa análisis', () => {
    expect(analyzer.analyze({ body: person165, category: 'top', sizeChart: [{ size: 'M' }], size: 'M' })).toBeNull();
  });
});

describe('FitEngine con estatura y peso', () => {
  const engine = new FitEngine();

  it('recomienda S (no XL) a 1,65 m / 58 kg, con confianza media por ser estimado', () => {
    const rec = engine.recommend({ measurements: { heightCm: 165, weightKg: 58, silhouette: 'feminine' }, sizeChart: tee, category: 'top', stretch: 'medium' });
    expect(['S', 'M']).toContain(rec.recommendedSize);
    expect(rec.confidence).toBe('medium');
    expect(rec.basis).toContain('fit.basis.estimatedFromWeight');
  });

  it('con medidas de cinta la confianza es alta', () => {
    const rec = engine.recommend({ measurements: { heightCm: 180, chestCm: 104, waistCm: 88, hipCm: 100 }, sizeChart: tee, category: 'top' });
    expect(rec.confidence).toBe('high');
    expect(rec.recommendedSize).toBe('L');
  });

  it('analyze() devuelve un análisis por talla', () => {
    const all = engine.analyze({ measurements: { heightCm: 165, weightKg: 58 }, sizeChart: tee, category: 'top' });
    expect(all.map((a) => a.size)).toEqual(tee.map((e) => e.size));
  });
});
