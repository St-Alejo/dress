import type { GarmentDims } from '@vestirse/shared-types';
import { gradeGarment, type BodyRanges } from '../domain/garment-grading';

export interface SizeInput extends BodyRanges {
  height?: [number, number];
  /** Medidas de prenda explícitas; si faltan se derivan del estilo. */
  garment?: GarmentDims;
}

/** Filas de `SizeChartEntry` (tabla corporal + medidas de prenda) para Prisma. */
export function sizeRows(style: string, entries: SizeInput[]) {
  const graded = gradeGarment(style, entries);
  return entries.map((e, i) => {
    const g = e.garment ?? graded[i];
    return {
      size: e.size,
      sortOrder: i,
      chestMin: e.chest?.[0], chestMax: e.chest?.[1],
      waistMin: e.waist?.[0], waistMax: e.waist?.[1],
      hipMin: e.hip?.[0], hipMax: e.hip?.[1],
      heightMin: e.height?.[0], heightMax: e.height?.[1],
      gChest: g?.chestCm, gWaist: g?.waistCm, gHip: g?.hipCm,
      gLength: g?.lengthCm, gSleeve: g?.sleeveCm, gInseam: g?.inseamCm,
    };
  });
}
