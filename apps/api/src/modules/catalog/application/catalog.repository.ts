import type { Brand, GarmentCategory, GarmentItem, SimilarBodyModel } from '@vestirse/shared-types';

export interface GarmentFilter {
  category?: GarmentCategory;
  brandId?: string;
  q?: string;
  includeInactive?: boolean;
}

/** Puerto Repository (sección 10): el dominio no sabe dónde viven los datos. */
export abstract class CatalogRepository {
  abstract listGarments(filter: GarmentFilter): Promise<GarmentItem[]>;
  abstract findGarment(id: string): Promise<GarmentItem | null>;
  abstract listBrands(): Promise<Brand[]>;
  /** Modelos de cuerpo; si se pasa `garmentId`, `previewImages` trae solo esa prenda. */
  abstract listBodyModels(garmentId?: string): Promise<SimilarBodyModel[]>;
  /** `photo` = foto real de producto, preferida para la IA cuando existe. */
  abstract garmentImageKeys(id: string): Promise<{ flat: string; front: string; photo?: string } | null>;
}
