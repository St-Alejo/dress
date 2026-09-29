/**
 * Invariantes de la sección 6: la cámara pide solo video (nunca audio) y el
 * stream se detiene siempre al salir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraService } from './camera.service';

function fakeStream() {
  const track = { readyState: 'live', stop: vi.fn(function (this: { readyState: string }) { this.readyState = 'ended'; }) };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

describe('CameraService', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let video: HTMLVideoElement;
  const original = navigator.mediaDevices;

  beforeEach(() => {
    getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    video = document.createElement('video');
    video.play = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: original, configurable: true });
  });

  it('pide solo video, nunca audio', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream);
    await new CameraService().start(video);
    const constraints = getUserMedia.mock.calls[0][0] as MediaStreamConstraints;
    expect(constraints.audio).toBe(false);
    expect(constraints.video).toBeTruthy();
  });

  it('detiene todas las pistas y suelta el video al parar', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const camera = new CameraService();
    await camera.start(video);
    expect(camera.active).toBe(true);
    camera.stop(video);
    expect(track.stop).toHaveBeenCalled();
    expect(camera.active).toBe(false);
    expect(video.srcObject).toBeNull();
  });

  it('traduce el rechazo de permisos a un error entendible', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    await expect(new CameraService().start(video)).rejects.toBe('denied');
  });
});
