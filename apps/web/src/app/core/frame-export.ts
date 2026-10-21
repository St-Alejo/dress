// Convertir un lienzo de la cámara en imagen vive fuera de features/live-overlay a propósito:
// la invariante "Track A sin red" prohíbe que la cámara serialice fotogramas. Solo se llega
// aquí tras un gesto explícito (guardar captura o "Foto realista", que además pide consentimiento).

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Descarga el lienzo en el dispositivo. No sale nada por la red. */
export async function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await canvasToBlob(canvas, 'image/png');
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
