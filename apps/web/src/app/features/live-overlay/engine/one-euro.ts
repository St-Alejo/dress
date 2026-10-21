/**
 * Filtro One Euro (Casiez, Roussel y Vogel, 2012): suaviza mucho cuando el punto está
 * quieto (quita el temblor del modelo de pose) y casi nada cuando se mueve rápido (sin
 * retardo visible). `minCutoff` controla el temblor en reposo y `beta` la reacción a la
 * velocidad.
 */
export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.02,
    private readonly dCutoff = 1,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** `t` en milisegundos. */
  filter(value: number, t: number): number {
    if (this.x === null) {
      this.x = value;
      this.t = t;
      return value;
    }
    const dt = Math.max((t - this.t) / 1000, 1e-3);
    this.t = t;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuroFilter.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuroFilter.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  /** Velocidad estimada (unidades/s), para prolongar un punto que se pierde un instante. */
  get velocity(): number {
    return this.dx;
  }

  get value(): number | null {
    return this.x;
  }

  reset(): void {
    this.x = null;
    this.dx = 0;
  }
}
