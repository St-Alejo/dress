import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { GarmentItem, PoseRatios } from '@vestirse/shared-types';
import { CameraService, type CameraError } from './camera.service';
import { fitHintFor, overlayTransform, poseRatiosFrom, supportsLiveOverlay, type FitHint } from './overlay-geometry';
import { PoseService } from './pose.service';

const HINT_INTERVAL_MS = 300;

/**
 * Track A — overlay en vivo, 100% en el navegador (sección 6).
 * El bucle de detección corre con requestAnimationFrame y dibuja directo en el
 * <canvas>; al mundo de Angular solo entran señales a ~3 Hz y únicamente cuando
 * cambian. Ni el video ni los frames salen del dispositivo.
 */
@Component({
  selector: 'app-live-tryon',
  imports: [TranslocoPipe],
  providers: [CameraService, PoseService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative mx-auto overflow-hidden bg-black aspect-[3/4] w-full max-w-[min(100%,51vh)]">
      <!-- Espejo en video y lienzo por igual, para que el overlay quede alineado. -->
      <div class="absolute inset-0 -scale-x-100">
        <video #video class="absolute inset-0 h-full w-full object-cover" playsinline muted></video>
        <canvas #overlay class="absolute inset-0 h-full w-full object-cover"></canvas>
      </div>

      @if (state() === 'running') {
        <!-- Silueta guía: no es un recuadro de detección, es una pista de encuadre. -->
        <svg class="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 300 400" aria-hidden="true">
          <ellipse cx="150" cy="200" rx="92" ry="170" fill="none" stroke="white" [attr.stroke-opacity]="hint() === 'good' ? 1 : 0.55" stroke-width="2" [attr.stroke-dasharray]="hint() === 'good' ? null : '6 6'" />
        </svg>
        <p class="absolute inset-x-3 top-3 bg-black/60 px-4 py-2 text-center text-sm text-white" role="status" aria-live="polite">
          {{ 'live.hint.' + hint() | transloco }}
        </p>
        <p class="absolute inset-x-3 bottom-3 bg-black/60 px-3 py-2 text-center text-xs text-white/90">
          {{ 'live.quickPreview' | transloco }}
        </p>
      } @else {
        <div class="absolute inset-0 grid place-items-center p-6 text-center text-white">
          <div class="max-w-xs space-y-3">
            @switch (state()) {
              @case ('idle') {
                <p class="text-sm text-white/80">{{ 'live.intro' | transloco }}</p>
                <button type="button" class="btn btn-primary" (click)="start()">{{ 'live.start' | transloco }}</button>
                <p class="text-xs text-white/60">{{ 'live.privacy' | transloco }}</p>
              }
              @case ('loading') {
                <p class="text-sm">{{ 'live.loading' | transloco }}</p>
              }
              @case ('unsupported-garment') {
                <p class="text-sm">{{ 'live.unsupportedGarment' | transloco }}</p>
              }
              @default {
                <p class="text-sm">{{ 'live.error.' + state() | transloco }}</p>
                <button type="button" class="btn" (click)="start()">{{ 'common.retry' | transloco }}</button>
              }
            }
          </div>
        </div>
      }
    </div>
    @if (state() === 'running') {
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" class="btn" (click)="stop()">{{ 'live.stop' | transloco }}</button>
        @if (ratios()) {
          <span class="text-xs text-muted">{{ 'live.ratiosReady' | transloco }}</span>
        }
      </div>
    }
  `,
})
export class LiveTryOnComponent implements OnDestroy {
  readonly garment = input.required<GarmentItem>();
  /** Solo números (proporciones), nunca imagen. El padre decide si usarlos. */
  readonly poseRatios = output<PoseRatios>();

  private readonly camera = inject(CameraService);
  private readonly pose = inject(PoseService);
  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('overlay');

  readonly state = signal<'idle' | 'loading' | 'running' | 'unsupported-garment' | CameraError | 'model'>('idle');
  readonly hint = signal<FitHint>('no-body');
  readonly ratios = signal<PoseRatios | null>(null);
  readonly supported = computed(() => supportsLiveOverlay(this.garment().category));

  private rafId = 0;
  private lastHintAt = 0;
  private overlayImg?: HTMLImageElement;
  private readonly onVisibility = () => {
    if (document.hidden) this.stop();
  };

  async start() {
    if (!this.supported()) {
      this.state.set('unsupported-garment');
      return;
    }
    this.state.set('loading');
    const video = this.videoRef().nativeElement;
    try {
      await this.camera.start(video);
    } catch (err) {
      this.state.set(err as CameraError);
      return;
    }
    try {
      await Promise.all([this.pose.init(), this.loadOverlay()]);
    } catch {
      this.camera.stop(video);
      this.state.set('model');
      return;
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    this.state.set('running');
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop() {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.camera.stop(this.videoRef().nativeElement);
    const canvas = this.canvasRef().nativeElement;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    if (this.state() === 'running' || this.state() === 'loading') this.state.set('idle');
  }

  ngOnDestroy() {
    // Apagar la cámara siempre, sin excepción (sección 6).
    this.stop();
    this.pose.dispose();
  }

  private loadOverlay(): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.overlayImg = img;
        resolve();
      };
      img.onerror = reject;
      img.src = this.garment().images.overlay;
    });
  }

  private readonly loop = () => {
    const video = this.videoRef().nativeElement;
    const canvas = this.canvasRef().nativeElement;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w && h) {
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const points = this.pose.detect(video, w, h);
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const hint = fitHintFor(points, w);
      if (points && hint === 'good' && this.overlayImg) {
        const g = this.garment();
        const m = overlayTransform(g.overlayAnchors, points);
        if (m) {
          ctx.setTransform(...m);
          ctx.globalAlpha = 0.92;
          ctx.drawImage(this.overlayImg, 0, 0, g.overlaySize[0], g.overlaySize[1]);
          ctx.globalAlpha = 1;
        }
      }
      this.pushThrottled(hint, points ? poseRatiosFrom(points) : null);
    }
    if (this.rafId) this.rafId = requestAnimationFrame(this.loop);
  };

  /** Único punto de contacto con Angular desde el bucle: señales a baja frecuencia. */
  private pushThrottled(hint: FitHint, ratios: PoseRatios | null) {
    const now = performance.now();
    if (now - this.lastHintAt < HINT_INTERVAL_MS) return;
    this.lastHintAt = now;
    if (this.hint() !== hint) this.hint.set(hint);
    if (ratios && hint === 'good' && ratios.shoulderToHipRatio !== this.ratios()?.shoulderToHipRatio) {
      this.ratios.set(ratios);
      this.poseRatios.emit(ratios);
    }
  }
}
