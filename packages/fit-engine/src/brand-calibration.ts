/**
 * Aprende de las correcciones manuales de talla por marca/categoría
 * ("esta marca talla pequeño"). Solo se aplica con suficientes muestras y
 * siempre se declara en `basis` — nunca un ajuste silencioso.
 */
export class BrandCalibration {
  static readonly MIN_SAMPLES = 20;
  /** Fracción mínima de correcciones en la misma dirección para desplazar la talla. */
  static readonly MIN_SHIFT = 0.5;

  constructor(
    readonly brandId: string,
    readonly sampleSize: number,
    /** Suma de desplazamientos (índice elegido - índice recomendado). */
    readonly shiftSum: number,
  ) {}

  static empty(brandId: string): BrandCalibration {
    return new BrandCalibration(brandId, 0, 0);
  }

  /** Devuelve una nueva calibración (inmutable) con una observación más. */
  record(recommendedIndex: number, chosenIndex: number): BrandCalibration {
    return new BrandCalibration(this.brandId, this.sampleSize + 1, this.shiftSum + (chosenIndex - recommendedIndex));
  }

  get meanShift(): number {
    return this.sampleSize === 0 ? 0 : this.shiftSum / this.sampleSize;
  }

  get isReliable(): boolean {
    return this.sampleSize >= BrandCalibration.MIN_SAMPLES;
  }

  /** Desplazamiento entero de talla a aplicar (0, +1 o -1). */
  get offset(): number {
    if (!this.isReliable || Math.abs(this.meanShift) < BrandCalibration.MIN_SHIFT) return 0;
    return this.meanShift > 0 ? 1 : -1;
  }
}
