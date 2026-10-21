import { Injectable } from '@angular/core';
import type { ImageSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { RawLandmark } from './engine/body-tracker';

export type PoseModel = 'full' | 'lite';

/**
 * Facade sobre MediaPipe (sección 10): el resto de la app nunca toca la API de
 * MediaPipe. Los modelos y el WASM se sirven desde nuestro propio origen, así que
 * con la cámara encendida no hay peticiones a terceros.
 *
 * - Pose: `pose_landmarker_full` (33 puntos, más estable en codos y muñecas) con `lite`
 *   de respaldo en equipos lentos.
 * - Segmentación: `selfie_multiclass_256x256` (pelo, piel, cara, ropa) para saber qué
 *   partes de la persona van por delante de la prenda. Es opcional: sin ella, la prenda
 *   se dibuja igual, solo que sin oclusión.
 */
@Injectable()
export class PoseService {
  private landmarker: PoseLandmarker | null = null;
  private segmenter: ImageSegmenter | null = null;
  private lastTs = 0;
  private lastSegTs = 0;
  model: PoseModel = 'full';

  async init(model: PoseModel = 'full', mode: 'VIDEO' | 'IMAGE' = 'VIDEO'): Promise<void> {
    if (this.landmarker && this.model === model) return;
    this.landmarker?.close();
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks('/mediapipe/wasm');
    const create = (delegate: 'GPU' | 'CPU') =>
      vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `/models/pose_landmarker_${model}.task`, delegate },
        runningMode: mode,
        numPoses: 1,
      });
    try {
      this.landmarker = await create('GPU');
    } catch {
      this.landmarker = await create('CPU');
    }
    this.model = model;
  }

  /** Carga el segmentador; si falla (memoria, GPU), la cámara sigue sin oclusión. */
  async initSegmenter(mode: 'VIDEO' | 'IMAGE' = 'VIDEO'): Promise<boolean> {
    if (this.segmenter) return true;
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks('/mediapipe/wasm');
      const create = (delegate: 'GPU' | 'CPU') =>
        vision.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/models/selfie_multiclass_256x256.tflite', delegate },
          runningMode: mode,
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
      try {
        this.segmenter = await create('GPU');
      } catch {
        this.segmenter = await create('CPU');
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Landmarks normalizados de la persona (o undefined si no hay nadie). */
  detect(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): RawLandmark[] | undefined {
    if (!this.landmarker) return undefined;
    if (source instanceof HTMLVideoElement) {
      if (source.readyState < 2) return undefined;
      const ts = Math.max(performance.now(), this.lastTs + 1);
      this.lastTs = ts;
      return this.landmarker.detectForVideo(source, ts).landmarks[0];
    }
    return this.landmarker.detect(source).landmarks[0];
  }

  /** Máscara de categorías (w×h) de un fotograma ya reducido. Se copia: MediaPipe reutiliza su memoria. */
  segment(source: HTMLCanvasElement | HTMLImageElement, video: boolean): { labels: Uint8Array; width: number; height: number } | null {
    if (!this.segmenter) return null;
    const result = video
      ? this.segmenter.segmentForVideo(source, (this.lastSegTs = Math.max(performance.now(), this.lastSegTs + 1)))
      : this.segmenter.segment(source);
    const mask = result.categoryMask;
    if (!mask) return null;
    const out = { labels: new Uint8Array(mask.getAsUint8Array()), width: mask.width, height: mask.height };
    result.close();
    return out;
  }

  get hasSegmenter(): boolean {
    return !!this.segmenter;
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.segmenter?.close();
    this.segmenter = null;
  }
}
