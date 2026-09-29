import type { SizeChartEntry } from '@vestirse/shared-types';

type Range = [number, number];
export type MeasureKey = 'chestCm' | 'waistCm' | 'hipCm' | 'heightCm';

/** Value object inmutable: tabla de tallas ordenada de menor a mayor. */
export class SizeChart {
  private readonly entries: readonly SizeChartEntry[];

  constructor(entries: SizeChartEntry[]) {
    if (entries.length === 0) throw new Error('La tabla de tallas no puede estar vacía');
    this.entries = Object.freeze([...entries]);
  }

  get sizes(): string[] {
    return this.entries.map((e) => e.size);
  }

  get all(): readonly SizeChartEntry[] {
    return this.entries;
  }

  has(size: string): boolean {
    return this.indexOf(size) >= 0;
  }

  indexOf(size: string): number {
    return this.entries.findIndex((e) => e.size === size);
  }

  at(index: number): SizeChartEntry {
    const clamped = Math.max(0, Math.min(this.entries.length - 1, index));
    return this.entries[clamped];
  }

  /** "Detallada" = tiene rangos de circunferencia (pecho, cintura o cadera). */
  isDetailed(): boolean {
    return this.entries.every((e) => e.chestCm || e.waistCm || e.hipCm);
  }

  hasHeightRanges(): boolean {
    return this.entries.every((e) => e.heightCm);
  }

  range(size: string, key: MeasureKey): Range | undefined {
    return this.entries.find((e) => e.size === size)?.[key];
  }
}
