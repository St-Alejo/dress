/**
 * Geometría de un cuerpo ilustrado a partir de medidas reales (cm).
 * Todas las prendas se dibujan sobre estos puntos, así una misma prenda se ve
 * distinta —y honesta— en cada cuerpo del catálogo "cuerpo similar al mío".
 */
export interface BodyShape {
  heightCm: number;
  shoulderCm: number;
  chestCm: number;
  waistCm: number;
  hipCm: number;
}

export const VIEW_W = 400;
export const VIEW_H = 900;
const FLOOR_Y = 885;
export const PX_PER_CM = 4.4;
/** Ancho frontal aproximado de una circunferencia (cm → cm). */
const frontWidth = (circumference: number) => circumference / 3.1;

export class BodyGeometry {
  readonly cx = VIEW_W / 2;
  readonly H: number;
  readonly top: number;

  constructor(readonly shape: BodyShape) {
    this.H = shape.heightCm * PX_PER_CM;
    this.top = FLOOR_Y - this.H;
  }

  /** y absoluto para una fracción de la altura medida desde la cabeza. */
  y(fraction: number): number {
    return this.top + this.H * fraction;
  }

  get headR() {
    return this.H * 0.062;
  }
  get headCy() {
    return this.y(0.068);
  }
  get neckW() {
    return this.H * 0.05;
  }
  get shoulderY() {
    return this.y(0.18);
  }
  get chestY() {
    return this.y(0.27);
  }
  get waistY() {
    return this.y(0.4);
  }
  get hipY() {
    return this.y(0.5);
  }
  get crotchY() {
    return this.y(0.53);
  }
  get thighMidY() {
    return this.y(0.63);
  }
  get kneeY() {
    return this.y(0.73);
  }
  get ankleY() {
    return this.y(0.955);
  }
  get elbowY() {
    return this.y(0.36);
  }
  get wristY() {
    return this.y(0.5);
  }

  /** Semianchos horizontales en px. */
  get shoulderHalf() {
    return (this.shape.shoulderCm * PX_PER_CM) / 2;
  }
  get chestHalf() {
    return (frontWidth(this.shape.chestCm) * PX_PER_CM) / 2;
  }
  get waistHalf() {
    return (frontWidth(this.shape.waistCm) * PX_PER_CM) / 2;
  }
  get hipHalf() {
    return (frontWidth(this.shape.hipCm) * PX_PER_CM) / 2;
  }
  get armW() {
    return this.H * 0.032 + (this.shape.chestCm - 80) * 0.18;
  }
  get thighHalf() {
    return this.hipHalf * 0.52;
  }
  get kneeHalf() {
    return this.thighHalf * 0.62;
  }
  get ankleHalf() {
    return this.H * 0.016;
  }

  /** Centro x de cada pierna ("l" = izquierda de la persona = derecha de la imagen). */
  legCx(side: 'l' | 'r', atY: number): number {
    const t = (atY - this.hipY) / (this.ankleY - this.hipY);
    const offsetHip = this.hipHalf * 0.48;
    const offsetAnkle = this.H * 0.045;
    const off = offsetHip + (offsetAnkle - offsetHip) * Math.max(0, Math.min(1, t));
    return side === 'l' ? this.cx + off : this.cx - off;
  }

  /** Borde exterior del brazo a una altura dada (el brazo cuelga levemente separado del torso). */
  armOuterX(side: 'l' | 'r', atY: number): number {
    const t = (atY - this.shoulderY) / (this.wristY - this.shoulderY);
    const base = Math.max(this.shoulderHalf, this.chestHalf, this.hipHalf * 0.95);
    const off = this.shoulderHalf + (base + this.armW * 0.6 - this.shoulderHalf) * t + this.armW * 0.4;
    return side === 'l' ? this.cx + off : this.cx - off;
  }

  /** Semiancho del torso interpolado a una altura. */
  torsoHalfAt(atY: number): number {
    const stops: [number, number][] = [
      [this.shoulderY, this.shoulderHalf * 0.92],
      [this.chestY, this.chestHalf],
      [this.waistY, this.waistHalf],
      [this.hipY, this.hipHalf],
      [this.crotchY, this.hipHalf * 0.98],
    ];
    if (atY <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      const [y1, w1] = stops[i];
      const [y0, w0] = stops[i - 1];
      if (atY <= y1) return w0 + ((w1 - w0) * (atY - y0)) / (y1 - y0);
    }
    return stops[stops.length - 1][1];
  }

  /** Anclas en coordenadas de imagen (para alinear el overlay de Track A con keypoints). */
  anchors() {
    return {
      leftShoulder: [this.cx + this.shoulderHalf, this.shoulderY] as [number, number],
      rightShoulder: [this.cx - this.shoulderHalf, this.shoulderY] as [number, number],
      leftHip: [this.cx + this.hipHalf * 0.8, this.hipY] as [number, number],
      rightHip: [this.cx - this.hipHalf * 0.8, this.hipY] as [number, number],
    };
  }
}

/** Cuerpo de referencia (talla M) sobre el que se dibujan las imágenes planas y de overlay. */
export const REFERENCE_SHAPE: BodyShape = { heightCm: 172, shoulderCm: 42, chestCm: 95, waistCm: 78, hipCm: 100 };
