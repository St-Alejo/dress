import type { BodyPose, GarmentItem, PhotoCheckReason } from '@vestirse/shared-types';
import { fitHintFor, needsFor, type FitHint } from '../live-overlay/overlay-geometry';
import { PoseService } from '../live-overlay/pose.service';
import { bodyFromPose } from '../live-overlay/engine/static-pose';

/**
 * Pose y segmentación de la foto de la persona, medidas EN EL NAVEGADOR con el mismo
 * MediaPipe que la cámara. Dan dos cosas sin IA ni cuota y sin que nada salga del equipo:
 * - el aviso de encuadre al instante, antes de subir la foto;
 * - la «vista aproximada» de la prenda sobre su propia foto mientras genera la IA (o si no puede).
 * El formato es el mismo `BodyPose` precalculado de los modelos del catálogo.
 */

/** Lado largo de la máscara: la entrada del segmentador es de 256 px. */
const SEG_LONG_SIDE = 256;

export function segSize(width: number, height: number): { width: number; height: number } {
  const scale = SEG_LONG_SIDE / Math.max(width, height, 1);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Codificación por tramos [etiqueta, longitud, …], la misma de `scripts/body-poses.mjs`. */
export function encodeRle(labels: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < labels.length; ) {
    let j = i;
    while (j < labels.length && labels[j] === labels[i]) j++;
    out.push(labels[i], j - i);
    i = j;
  }
  return out;
}

/** Qué falta en la foto para vestir esta prenda, en los mismos términos que el aviso del servidor. */
const HINT_REASON: Partial<Record<FitHint, PhotoCheckReason>> = {
  'no-body': 'no-person',
  'too-close': 'not-full-body',
  'show-hips': 'not-full-body',
  'show-legs': 'not-full-body',
  'show-feet': 'not-full-body',
  'show-head': 'not-full-body',
};

export function localPhotoReason(pose: BodyPose | null, garment: Pick<GarmentItem, 'category' | 'style'>): PhotoCheckReason | null {
  const body = pose ? bodyFromPose(pose) : null;
  return HINT_REASON[fitHintFor(body, pose?.width ?? 1, needsFor(garment))] ?? null;
}

/**
 * Mide fotos una tras otra con los modelos cargados una sola vez.
 * Devuelve la pose, `null` si no hay nadie en la foto, o `undefined` si no se pudo medir
 * (navegador sin WASM, memoria): entonces no se avisa nada y la prueba sigue sin vista aproximada.
 */
export class PhotoPoseMeter {
  private readonly pose = new PoseService();
  private ready: Promise<boolean> | null = null;

  async measure(canvas: HTMLCanvasElement): Promise<BodyPose | null | undefined> {
    this.ready ??= this.pose
      .init('full', 'IMAGE')
      .then(() => this.pose.initSegmenter('IMAGE'))
      .then(() => true)
      .catch(() => false);
    if (!(await this.ready)) return undefined;
    try {
      const landmarks = this.pose.detect(canvas);
      if (!landmarks || landmarks.length !== 33) return null;
      const size = segSize(canvas.width, canvas.height);
      const small = document.createElement('canvas');
      small.width = size.width;
      small.height = size.height;
      small.getContext('2d')!.drawImage(canvas, 0, 0, size.width, size.height);
      // Sin segmentador la máscara queda vacía: la prenda se dibuja igual, sin oclusión.
      const seg = this.pose.segment(small, false) ?? { labels: new Uint8Array(size.width * size.height), ...size };
      return {
        version: 1,
        width: canvas.width,
        height: canvas.height,
        landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, v: p.visibility ?? 1 })),
        seg: { width: seg.width, height: seg.height, rle: encodeRle(seg.labels) },
      };
    } catch {
      return undefined;
    }
  }

  dispose(): void {
    this.pose.dispose();
    this.ready = null;
  }
}
