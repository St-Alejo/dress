import { Injectable } from '@angular/core';

export type CameraError = 'denied' | 'unavailable' | 'unsupported';

/**
 * Facade de la cámara (sección 10). Reglas de la sección 6:
 * - solo video, nunca audio;
 * - el stream se detiene siempre al salir, sin excepción;
 * - el frame nunca sale del dispositivo (este servicio no tiene acceso a red).
 */
@Injectable()
export class CameraService {
  private stream: MediaStream | null = null;

  get active(): boolean {
    return !!this.stream?.getTracks().some((t) => t.readyState === 'live');
  }

  async start(video: HTMLVideoElement): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw 'unsupported' satisfies CameraError;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } },
        audio: false,
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      throw (name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable') satisfies CameraError;
    }
    video.srcObject = this.stream;
    video.muted = true;
    await video.play().catch(() => undefined);
  }

  stop(video?: HTMLVideoElement): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (video) video.srcObject = null;
  }
}
