/**
 * Preparación de la foto EN EL NAVEGADOR antes de subirla:
 * - detección de rostro local para sugerir recortarlo o difuminarlo (regla 1);
 * - re-codificación en canvas, que descarta EXIF/GPS.
 * El servidor vuelve a limpiar metadatos igualmente (defensa en profundidad).
 */
export type FaceTreatment = 'crop' | 'blur' | 'keep';

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAX_SIDE = 1024;

export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

/** Rostro principal (en px de la imagen) o null. Carga el detector solo si hace falta. */
export async function detectFace(bitmap: ImageBitmap): Promise<FaceBox | null> {
  try {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks('/mediapipe/wasm');
    const detector = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite' },
      runningMode: 'IMAGE',
    });
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const res = detector.detect(canvas);
    detector.close();
    const box = res.detections.sort((a, b) => (b.categories[0]?.score ?? 0) - (a.categories[0]?.score ?? 0))[0]?.boundingBox;
    return box ? { x: box.originX, y: box.originY, width: box.width, height: box.height } : null;
  } catch {
    return null;
  }
}

/** Primera fila visible tras recortar el rostro: un poco por debajo de la barbilla. */
export function cropTopBelowFace(face: FaceBox, imageHeight: number): number {
  return Math.min(imageHeight * 0.45, face.y + face.height * 1.15);
}

export interface PrepOptions {
  treatment: FaceTreatment;
  face: FaceBox | null;
  /** Recorte manual desde arriba, en fracción de la altura (0..0.5). */
  manualCropTop: number;
}

/** Dibuja la foto preparada en el lienzo dado (sirve también como vista previa). */
export function renderPrepared(bitmap: ImageBitmap, canvas: HTMLCanvasElement, opts: PrepOptions): void {
  let top = Math.round(bitmap.height * opts.manualCropTop);
  if (opts.treatment === 'crop' && opts.face) top = Math.max(top, Math.round(cropTopBelowFace(opts.face, bitmap.height)));
  const srcH = bitmap.height - top;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, srcH));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(srcH * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, top, bitmap.width, srcH, 0, 0, canvas.width, canvas.height);

  if (opts.treatment === 'blur' && opts.face) {
    const f = opts.face;
    const pad = f.width * 0.25;
    const x = (f.x - pad) * scale;
    const y = (f.y - pad - top) * scale;
    const w = (f.width + pad * 2) * scale;
    const h = (f.height + pad * 2) * scale;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.filter = `blur(${Math.max(12, w / 6)}px)`;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(128,128,128,.35)';
    ctx.fill();
    ctx.restore();
  }
}

export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no se pudo codificar'))), 'image/jpeg', 0.9),
  );
}
