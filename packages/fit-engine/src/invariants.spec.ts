/**
 * Invariante ética 5 (sección 4): la recomendación nunca se presenta como certeza.
 * Toda salida trae confianza y base no vacía, y el override siempre es aceptado.
 */
import { describe, expect, it } from 'vitest';
import type { GarmentCategory, SizeChartEntry } from '@vestirse/shared-types';
import { FitEngine } from './fit-engine';

const charts: SizeChartEntry[][] = [
  [{ size: 'S', chestCm: [84, 91] }, { size: 'M', chestCm: [92, 99] }, { size: 'L', chestCm: [100, 107] }],
  [{ size: 'XS' }, { size: 'S' }, { size: 'M' }, { size: 'L' }, { size: 'XL' }, { size: 'XXL' }, { size: '3XL' }, { size: '4XL' }],
  [{ size: '36' }, { size: '38' }, { size: '40' }],
  [{ size: 'M', heightCm: [160, 175] }, { size: 'L', heightCm: [174, 190] }],
];
const bodies = [
  { heightCm: 150 },
  { heightCm: 172, chestCm: 95 },
  { heightCm: 195, chestCm: 140, waistCm: 130 },
  { heightCm: 160, waistCm: 60 },
];
const categories: GarmentCategory[] = ['top', 'bottom', 'dress'];

describe('invariantes: recomendación de talla', () => {
  const engine = new FitEngine();
  for (const chart of charts) {
    for (const measurements of bodies) {
      for (const category of categories) {
        it(`${chart.map((c) => c.size).join('/')} · ${JSON.stringify(measurements)} · ${category}`, () => {
          const rec = engine.recommend({ measurements, sizeChart: chart, category });
          expect(['low', 'medium', 'high']).toContain(rec.confidence);
          expect(rec.basis.length).toBeGreaterThan(0);
          expect(chart.map((c) => c.size)).toContain(rec.recommendedSize);
          for (const { size } of chart) {
            expect(engine.applyOverride(rec, size, chart).userOverride).toBe(size);
          }
        });
      }
    }
  }
});
