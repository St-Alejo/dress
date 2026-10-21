import { OneEuroFilter } from './one-euro';
import type { Body, JointName } from './rig';

/** Índices de BlazePose (33 landmarks). "left" = lado izquierdo de la persona. */
export const BLAZEPOSE: Record<JointName, number> = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftFoot: 31,
  rightFoot: 32,
};

/** Landmark normalizado tal como lo da MediaPipe. */
export interface RawLandmark {
  x: number;
  y: number;
  visibility?: number;
}

/** Cuánto se mantiene un punto que el modelo pierde un instante (oclusión breve, desenfoque). */
export const HOLD_MS = 220;
const VISIBLE = 0.5;

interface Track {
  fx: OneEuroFilter;
  fy: OneEuroFilter;
  lastSeen: number;
  v: number;
}

/**
 * Convierte landmarks crudos en un `Body` estable: filtro One Euro por coordenada (sin
 * temblor y sin retardo visible) y, si un punto desaparece, lo prolonga con su última
 * velocidad durante HOLD_MS antes de darlo por perdido.
 */
export class BodyTracker {
  private readonly tracks = new Map<JointName, Track>();

  constructor(
    private readonly minCutoff = 1.0,
    private readonly beta = 0.015,
  ) {}

  update(landmarks: RawLandmark[] | undefined, width: number, height: number, t: number): Body | null {
    const body: Body = {};
    let any = false;
    for (const [name, index] of Object.entries(BLAZEPOSE) as [JointName, number][]) {
      let track = this.tracks.get(name);
      if (!track) {
        track = { fx: new OneEuroFilter(this.minCutoff, this.beta), fy: new OneEuroFilter(this.minCutoff, this.beta), lastSeen: -Infinity, v: 0 };
        this.tracks.set(name, track);
      }
      const lm = landmarks?.[index];
      const inFrame = !!lm && lm.y >= -0.02 && lm.y <= 1.02 && lm.x >= -0.02 && lm.x <= 1.02;
      const visibility = inFrame ? (lm!.visibility ?? 1) : 0;
      if (lm && visibility >= VISIBLE) {
        const x = track.fx.filter(lm.x * width, t);
        const y = track.fy.filter(lm.y * height, t);
        track.lastSeen = t;
        track.v = visibility;
        body[name] = { p: [x, y], v: visibility };
        any = true;
        continue;
      }
      const age = t - track.lastSeen;
      const lx = track.fx.value;
      const ly = track.fy.value;
      if (age <= HOLD_MS && lx !== null && ly !== null) {
        // Se mantiene con su inercia, y la confianza baja con el tiempo.
        const dt = age / 1000;
        const fade = 1 - age / HOLD_MS;
        body[name] = { p: [lx + track.fx.velocity * dt * 0.5, ly + track.fy.velocity * dt * 0.5], v: Math.max(VISIBLE, track.v * fade) };
        any = true;
      } else {
        track.fx.reset();
        track.fy.reset();
        if (lm) body[name] = { p: [lm.x * width, lm.y * height], v: visibility };
      }
    }
    return any || landmarks ? body : null;
  }

  reset(): void {
    this.tracks.clear();
  }
}
