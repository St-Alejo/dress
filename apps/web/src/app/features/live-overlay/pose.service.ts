import { Injectable } from '@angular/core';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PosePoints, Pt } from './overlay-geometry';

// Índices de BlazePose (33 landmarks). "left" = lado izquierdo de la persona.
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_HIP = 23;
const R_HIP = 24;

/**
 * Facade sobre MediaPipe (sección 10): el resto de la app nunca toca la API de
 * MediaPipe. El modelo y el WASM se sirven desde nuestro propio origen, así que
 * con la cámara encendida no hay peticiones a terceros.
 */
@Injectable()
export class PoseService {
  private landmarker: PoseLandmarker | null = null;
  private lastTs = 0;

  async init(): Promise<void> {
    if (this.landmarker) return;
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks('/mediapipe/wasm');
    const create = (delegate: 'GPU' | 'CPU') =>
      vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    try {
      this.landmarker = await create('GPU');
    } catch {
      this.landmarker = await create('CPU');
    }
  }

  /** Devuelve solo los puntos necesarios, en px del lienzo destino. */
  detect(video: HTMLVideoElement, width: number, height: number): PosePoints | null {
    if (!this.landmarker || video.readyState < 2) return null;
    const ts = Math.max(performance.now(), this.lastTs + 1);
    this.lastTs = ts;
    const result = this.landmarker.detectForVideo(video, ts);
    const lm = result.landmarks[0];
    if (!lm) return null;
    const pt = (i: number): Pt => [lm[i].x * width, lm[i].y * height];
    const vis = (i: number) => {
      const v = lm[i].visibility ?? 1;
      return lm[i].y > 1.02 || lm[i].y < -0.02 ? 0 : v;
    };
    return {
      leftShoulder: pt(L_SHOULDER),
      rightShoulder: pt(R_SHOULDER),
      leftHip: pt(L_HIP),
      rightHip: pt(R_HIP),
      shouldersVisible: Math.min(vis(L_SHOULDER), vis(R_SHOULDER)),
      hipsVisible: Math.min(vis(L_HIP), vis(R_HIP)),
    };
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
