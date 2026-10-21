import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { GarmentItem, PoseRatios } from '@vestirse/shared-types';
import { downloadCanvas } from '../../core/frame-export';
import { BodyTracker } from './engine/body-tracker';
import { easeGain, sceneGain } from './engine/lighting';
import { occlusionMask, softenMask } from './engine/occlusion';
import type { Body } from './engine/rig';
import { fitForSize } from './engine/size-fit';
import { type Adjust, NO_ADJUST, TryOnScene } from './engine/tryon-scene';
import { CameraService, type CameraError } from './camera.service';
import { canOverlay, fitHintFor, needsFor, poseRatiosFrom, type FitHint } from './overlay-geometry';
import { PoseService } from './pose.service';

const HINT_INTERVAL_MS = 300;
/** Tamaño del fotograma que ve el segmentador (su modelo trabaja a 256 px). */
const SEG_W = 192;
const SEG_H = 256;
const ADJUST_KEY = 'vestirse.live.adjust.';

/**
 * Track A — la prenda puesta en vivo, 100 % en el navegador (sección 6).
 *
 * El bucle (requestAnimationFrame) detecta la pose, la estabiliza, segmenta a la persona
 * cada pocos fotogramas para saber qué va por delante de la prenda, mide la luz de la
 * escena y dibuja la malla de la prenda con WebGL2. Al mundo de Angular solo entran
 * señales a ~3 Hz. Ni el video ni los fotogramas salen del dispositivo, salvo que la
 * persona pulse "Foto realista" y acepte enviarlo (eso lo decide el componente padre).
 */
@Component({
  selector: 'app-live-tryon',
  imports: [TranslocoPipe],
  providers: [CameraService, PoseService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #stage
      class="relative mx-auto touch-none overflow-hidden bg-black aspect-[3/4] w-full max-w-[min(100%,56vh)] select-none"
      (pointerdown)="dragStart($event)"
      (pointermove)="dragMove($event)"
      (pointerup)="dragEnd()"
      (pointercancel)="dragEnd()"
    >
      <!-- Espejo en video y lienzo por igual, para que la prenda quede alineada. -->
      <div class="absolute inset-0 -scale-x-100">
        <video #video class="absolute inset-0 h-full w-full object-cover" playsinline muted></video>
        <canvas #overlay class="absolute inset-0 h-full w-full object-cover"></canvas>
      </div>

      @if (state() === 'running') {
        @if (hint() !== 'good') {
          <svg class="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 300 400" aria-hidden="true">
            <ellipse cx="150" cy="200" rx="92" ry="170" fill="none" stroke="white" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="6 6" />
          </svg>
        }
        <p class="absolute inset-x-3 top-3 bg-black/60 px-4 py-2 text-center text-sm text-white" role="status" aria-live="polite">
          {{ 'live.hint.' + hint() | transloco }}
        </p>
        @if (countdown() > 0) {
          <div class="pointer-events-none absolute inset-0 grid place-items-center text-7xl font-semibold text-white drop-shadow" aria-live="assertive">{{ countdown() }}</div>
        }
        <p class="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 bg-black/60 px-3 py-2 text-xs text-white/90">
          <span>{{ (occlusion() ? 'live.qualityFull' : 'live.qualityBasic') | transloco }}</span>
          <span class="tabular-nums" aria-hidden="true">{{ fps() }} fps</span>
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
      <div class="mt-3 space-y-3">
        @if (sizes().length > 1) {
          <div class="flex flex-wrap items-center gap-2" role="group" [attr.aria-label]="'live.size' | transloco">
            <span class="text-xs text-muted">{{ 'live.size' | transloco }}</span>
            @for (s of sizes(); track s) {
              <button type="button" class="btn btn-sm" [class.btn-primary]="s === size()" [attr.aria-pressed]="s === size()" (click)="size.set(s)">
                {{ s }}@if (s === recommendedSize()) {<span class="sr-only"> ({{ 'live.recommended' | transloco }})</span><span aria-hidden="true"> ★</span>}
              </button>
            }
          </div>
        }
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn" (click)="capture()">{{ 'live.capture' | transloco }}</button>
          <button type="button" class="btn btn-primary" (click)="requestRealistic()" [disabled]="countdown() > 0">{{ 'live.realistic' | transloco }}</button>
          <span class="mx-1 h-5 w-px bg-line" aria-hidden="true"></span>
          <span class="text-xs text-muted">{{ 'live.adjust' | transloco }}</span>
          <button type="button" class="btn btn-sm" (click)="nudge(0, -8)" [attr.aria-label]="'live.up' | transloco">↑</button>
          <button type="button" class="btn btn-sm" (click)="nudge(0, 8)" [attr.aria-label]="'live.down' | transloco">↓</button>
          <button type="button" class="btn btn-sm" (click)="zoom(-0.04)" [attr.aria-label]="'live.smaller' | transloco">−</button>
          <button type="button" class="btn btn-sm" (click)="zoom(0.04)" [attr.aria-label]="'live.bigger' | transloco">+</button>
          <button type="button" class="btn btn-sm" (click)="resetAdjust()">{{ 'live.reset' | transloco }}</button>
          <button type="button" class="btn ml-auto" (click)="stop()">{{ 'live.stop' | transloco }}</button>
        </div>
        <p class="text-xs text-muted">{{ 'live.realisticNote' | transloco }}</p>
        @if (ratios()) {
          <p class="text-xs text-muted">{{ 'live.ratiosReady' | transloco }}</p>
        }
      </div>
    }
  `,
})
export class LiveTryOnComponent implements OnDestroy {
  readonly garment = input.required<GarmentItem>();
  /** Otras prendas del look que se visten a la vez (capas: abajo, arriba, abrigo). */
  readonly outfit = input<GarmentItem[]>([]);
  readonly recommendedSize = input<string | undefined>(undefined);
  /** Solo números (proporciones), nunca imagen. El padre decide si usarlos. */
  readonly poseRatios = output<PoseRatios>();
  /** Fotograma sin espejo ni prenda, para la prueba con IA. Solo se emite tras pulsar el botón. */
  readonly realisticFrame = output<HTMLCanvasElement>();

  private readonly camera = inject(CameraService);
  private readonly pose = inject(PoseService);
  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('overlay');

  readonly state = signal<'idle' | 'loading' | 'running' | 'unsupported-garment' | CameraError | 'model'>('idle');
  readonly hint = signal<FitHint>('no-body');
  readonly ratios = signal<PoseRatios | null>(null);
  readonly fps = signal(0);
  readonly occlusion = signal(false);
  readonly countdown = signal(0);
  readonly supported = computed(() => canOverlay(this.garment()));
  readonly sizes = computed(() => this.garment().sizeChart.map((s) => s.size));
  readonly size = signal<string | undefined>(undefined);
  private readonly wearing = computed(() => [this.garment(), ...this.outfit().filter((g) => g.id !== this.garment().id)]);

  private scene: TryOnScene | null = null;
  private readonly tracker = new BodyTracker();
  private body: Body | null = null;
  private rafId = 0;
  private frame = 0;
  private lastHintAt = 0;
  private lastFrameAt = 0;
  private fpsAvg = 30;
  private slowSince = 0;
  private segEvery = 2;
  private gain: [number, number, number] = [1, 1, 1];
  private targetGain: [number, number, number] = [1, 1, 1];
  private adjust: Adjust = { ...NO_ADJUST };
  private drag: { x: number; y: number; dx: number; dy: number } | null = null;
  private segCtx: CanvasRenderingContext2D | null = null;
  private lightCtx: CanvasRenderingContext2D | null = null;
  private occBuf: Uint8Array | null = null;
  private readonly onVisibility = () => {
    if (document.hidden) this.stop();
  };

  constructor() {
    // La talla de partida es la recomendada; la persona puede comparar con otras.
    effect(() => {
      const rec = this.recommendedSize();
      if (rec && !this.size()) this.size.set(rec);
    });
    // Cambiar el look con la cámara encendida recarga las prendas sin apagarla.
    effect(() => {
      const list = this.wearing();
      if (this.scene && this.state() === 'running') void this.scene.setGarments(list);
    });
  }

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
      this.scene ??= new TryOnScene(this.canvasRef().nativeElement);
      await Promise.all([this.pose.init(this.pose.model), this.scene.setGarments(this.wearing())]);
    } catch {
      this.camera.stop(video);
      this.state.set('model');
      return;
    }
    // La segmentación llega después: la prenda ya se ve mientras se carga.
    if (this.scene.usesWebGL) void this.pose.initSegmenter().then((ok) => this.occlusion.set(ok));
    this.adjust = this.loadAdjust();
    this.tracker.reset();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.state.set('running');
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop() {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.camera.stop(this.videoRef().nativeElement);
    this.scene?.clear();
    if (this.state() === 'running' || this.state() === 'loading') this.state.set('idle');
  }

  ngOnDestroy() {
    // Apagar la cámara siempre, sin excepción (sección 6).
    this.stop();
    this.scene?.dispose();
    this.pose.dispose();
  }

  /** Guarda en el dispositivo lo que se ve (video + prenda), sin subir nada. */
  capture() {
    const video = this.videoRef().nativeElement;
    const overlay = this.canvasRef().nativeElement;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext('2d')!;
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, c.width, c.height);
    ctx.drawImage(overlay, 0, 0, c.width, c.height);
    void downloadCanvas(c, `vestirse-${this.garment().name.toLowerCase().replace(/\W+/g, '-')}.png`);
  }

  /** Cuenta atrás de 3 s para ponerse en pose y entrega el fotograma limpio (sin codificar) al padre, que pide consentimiento. */
  requestRealistic() {
    this.countdown.set(3);
    const tick = () => {
      const n = this.countdown() - 1;
      this.countdown.set(n);
      if (n > 0) {
        setTimeout(tick, 1000);
        return;
      }
      const video = this.videoRef().nativeElement;
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d')!.drawImage(video, 0, 0);
      this.realisticFrame.emit(c);
    };
    setTimeout(tick, 1000);
  }

  nudge(dx: number, dy: number) {
    this.adjust = { ...this.adjust, dx: this.adjust.dx + dx, dy: this.adjust.dy + dy };
    this.saveAdjust();
  }

  zoom(delta: number) {
    this.adjust = { ...this.adjust, scale: Math.min(1.4, Math.max(0.7, this.adjust.scale + delta)) };
    this.saveAdjust();
  }

  resetAdjust() {
    this.adjust = { ...NO_ADJUST };
    this.saveAdjust();
  }

  dragStart(e: PointerEvent) {
    if (this.state() !== 'running') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.drag = { x: e.clientX, y: e.clientY, dx: this.adjust.dx, dy: this.adjust.dy };
  }

  dragMove(e: PointerEvent) {
    if (!this.drag) return;
    const stage = e.currentTarget as HTMLElement;
    const k = this.canvasRef().nativeElement.width / stage.clientWidth;
    // El escenario se ve en espejo: arrastrar a la derecha mueve la prenda a la izquierda del lienzo.
    this.adjust = { ...this.adjust, dx: this.drag.dx - (e.clientX - this.drag.x) * k, dy: this.drag.dy + (e.clientY - this.drag.y) * k };
  }

  dragEnd() {
    if (!this.drag) return;
    this.drag = null;
    this.saveAdjust();
  }

  private loadAdjust(): Adjust {
    try {
      const raw = localStorage.getItem(ADJUST_KEY + this.garment().id);
      return raw ? { ...NO_ADJUST, ...JSON.parse(raw) } : { ...NO_ADJUST };
    } catch {
      return { ...NO_ADJUST };
    }
  }

  private saveAdjust() {
    try {
      localStorage.setItem(ADJUST_KEY + this.garment().id, JSON.stringify(this.adjust));
    } catch {
      /* almacenamiento bloqueado: el ajuste dura solo esta sesión */
    }
  }

  private readonly loop = (now: number) => {
    const video = this.videoRef().nativeElement;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w && h && this.scene) {
      this.frame++;
      this.measureFps(now);
      this.body = this.tracker.update(this.pose.detect(video), w, h, now);
      if (this.body && this.occlusion() && this.frame % this.segEvery === 0) this.updateOcclusion(video, w, h);
      if (this.frame % 15 === 1) this.updateLight(video);
      this.gain = easeGain(this.gain, this.targetGain);
      this.scene.setLight(this.gain);
      const fits = Object.fromEntries(this.wearing().map((g) => [g.id, g.id === this.garment().id ? fitForSize(this.sizes(), this.recommendedSize(), this.size()) : { width: 1, length: 1 }]));
      this.scene.render(this.body, w, h, fits, this.adjust);
      this.pushThrottled(fitHintFor(this.body, w, needsFor(this.garment())), this.body ? poseRatiosFrom(this.body) : null);
    }
    if (this.rafId) this.rafId = requestAnimationFrame(this.loop);
  };

  private updateOcclusion(video: HTMLVideoElement, w: number, h: number) {
    if (!this.segCtx) {
      const c = document.createElement('canvas');
      c.width = SEG_W;
      c.height = SEG_H;
      this.segCtx = c.getContext('2d', { willReadFrequently: false });
    }
    const ctx = this.segCtx!;
    ctx.drawImage(video, 0, 0, SEG_W, SEG_H);
    const seg = this.pose.segment(ctx.canvas, true);
    if (!seg || !this.body) return;
    this.occBuf ??= new Uint8Array(seg.width * seg.height * 2);
    if (this.occBuf.length !== seg.width * seg.height * 2) this.occBuf = new Uint8Array(seg.width * seg.height * 2);
    const sx = w / seg.width;
    const sy = h / seg.height;
    softenMask(occlusionMask(seg.labels, seg.width, seg.height, this.body, (x, y) => [x * sx, y * sy], this.occBuf), seg.width, seg.height);
    this.scene!.setOcclusion(this.occBuf, seg.width, seg.height);
  }

  private updateLight(video: HTMLVideoElement) {
    if (!this.lightCtx) {
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      this.lightCtx = c.getContext('2d', { willReadFrequently: true });
    }
    const ctx = this.lightCtx!;
    ctx.drawImage(video, 0, 0, 16, 16);
    this.targetGain = sceneGain(ctx.getImageData(0, 0, 16, 16).data);
  }

  /** Calidad adaptativa: si el equipo no llega, segmenta menos y pasa al modelo de pose ligero. */
  private measureFps(now: number) {
    if (this.lastFrameAt) {
      const inst = 1000 / Math.max(now - this.lastFrameAt, 1);
      this.fpsAvg = this.fpsAvg * 0.95 + inst * 0.05;
    }
    this.lastFrameAt = now;
    if (this.fpsAvg < 18) {
      this.slowSince ||= now;
      if (now - this.slowSince > 3000) {
        this.slowSince = 0;
        if (this.segEvery < 4) this.segEvery++;
        else if (this.pose.model === 'full') void this.pose.init('lite');
      }
    } else {
      this.slowSince = 0;
    }
  }

  /** Único punto de contacto con Angular desde el bucle: señales a baja frecuencia. */
  private pushThrottled(hint: FitHint, ratios: PoseRatios | null) {
    const now = performance.now();
    if (now - this.lastHintAt < HINT_INTERVAL_MS) return;
    this.lastHintAt = now;
    if (this.hint() !== hint) this.hint.set(hint);
    const fps = Math.round(this.fpsAvg);
    if (fps !== this.fps()) this.fps.set(fps);
    if (ratios && ratios.shoulderToHipRatio !== this.ratios()?.shoulderToHipRatio) {
      this.ratios.set(ratios);
      this.poseRatios.emit(ratios);
    }
  }
}
