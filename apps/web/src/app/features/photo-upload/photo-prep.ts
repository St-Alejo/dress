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

/** Recorte cuadrado de la imagen (px) donde buscar el rostro. */
export interface FaceTile {
  x: number;
  y: number;
  size: number;
}

/** Puntuación mínima para aceptar un rostro hallado en un recorte. */
export const MIN_FACE_SCORE = 0.5;

/**
 * Recortes cuadrados donde buscar el rostro.
 *
 * BlazeFace (short range) está entrenado con selfies y redimensiona la entrada a un cuadrado de 128 px:
 * en una foto de cuerpo entero vertical la cara queda diminuta y deformada, así que no la encuentra o
 * devuelve una caja desplazada (que recortaría a media altura del pecho). Por eso se busca en cuadrados
 * de la parte superior: uno del ancho completo (selfies, primeros planos) y otros más pequeños (cuerpo
 * entero), en el centro y a los lados, arriba y algo más abajo.
 */
export function faceSearchTiles(width: number, height: number): FaceTile[] {
  const side = Math.min(width, height);
  const tiles: FaceTile[] = [];
  const seen = new Set<string>();
  for (const size of [side, Math.round(side * 0.6)]) {
    const xs = [Math.round((width - size) / 2), 0, width - size];
    const ys = [0, Math.min(height - size, Math.round(size / 2))];
    for (const y of ys) {
      for (const x of xs) {
        const key = `${x},${y},${size}`;
        if (!seen.has(key)) {
          seen.add(key);
          tiles.push({ x, y, size });
        }
      }
    }
  }
  return tiles;
}

/** Caja hallada dentro de un recorte, llevada a px de la imagen completa. */
export function tileBoxToImage(tile: FaceTile, box: FaceBox): FaceBox {
  return { x: box.x + tile.x, y: box.y + tile.y, width: box.width, height: box.height };
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
    try {
      let best: { score: number; box: FaceBox } | null = null;
      const canvas = document.createElement('canvas');
      for (const tile of faceSearchTiles(bitmap.width, bitmap.height)) {
        canvas.width = tile.size;
        canvas.height = tile.size;
        canvas.getContext('2d')!.drawImage(bitmap, tile.x, tile.y, tile.size, tile.size, 0, 0, tile.size, tile.size);
        for (const d of detector.detect(canvas).detections) {
          const score = d.categories[0]?.score ?? 0;
          if (d.boundingBox && score >= MIN_FACE_SCORE && (!best || score > best.score)) {
            const { originX, originY, width, height } = d.boundingBox;
            best = { score, box: tileBoxToImage(tile, { x: originX, y: originY, width, height }) };
          }
        }
      }
      return best?.box ?? null;
    } finally {
      detector.close();
    }
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
