import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import type { BodyPose } from '@vestirse/shared-types';
import { ChoiceGroupComponent, type ChoiceOption } from '../../shared/ui/choice-group.component';
import { ApproxViewComponent } from '../catalog/approx-view.component';
import { canOverlay } from '../live-overlay/overlay-geometry';
import { PrivacyChecklistComponent } from './privacy-checklist.component';
import { failureCopy } from './failure-copy';
import { PhotoPoseMeter, localPhotoReason } from './user-pose';
import { canvasToJpeg, detectFace, loadBitmap, renderPrepared, type FaceBox, type FaceTreatment } from './photo-prep';

type Step = 'intro' | 'checklist' | 'prepare' | 'uploading' | 'ready';

/** Tiempo típico de generación (s), solo para animar el progreso percibido con honestidad. */
const EXPECTED_SECONDS = 35;

@Component({
  selector: 'app-photo-tryon',
  imports: [TranslocoPipe, PrivacyChecklistComponent, RouterLink, ChoiceGroupComponent, ApproxViewComponent, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #approxTpl>
      @if (approx(); as a) {
        <div class="stage relative h-[min(60vh,520px)] overflow-hidden">
          <app-approx-view class="block h-full" [body]="a" [garments]="approxGarments()" />
          <p class="absolute right-3 top-3 bg-paper/90 px-2 py-1 text-[11px] text-ink-2">{{ 'body.approxPreview' | transloco }}</p>
        </div>
      }
    </ng-template>
    @let gen = store.generation();
    @if (store.hasPhoto() && step() !== 'prepare' && step() !== 'checklist') {
      <!-- Foto ya subida: generar, ver resultado o fallback -->
      <div class="space-y-4">
        @if (gen.status === 'done' && store.resultImageUrl()) {
          <figure class="card overflow-hidden">
            <div class="grid grid-cols-2 gap-px bg-line">
              <div class="bg-paper">
                <p class="label-xs px-3 py-2">{{ 'photo.before' | transloco }}</p>
                <img [src]="store.session()?.uploadedPhotoUrl" [alt]="'photo.before' | transloco" class="aspect-[2/3] w-full object-contain bg-surface-2" />
              </div>
              <div class="bg-paper">
                <p class="label-xs px-3 py-2">{{ 'photo.after' | transloco }}</p>
                <img [src]="store.resultImageUrl()" [alt]="'photo.resultAlt' | transloco" class="aspect-[2/3] w-full object-contain bg-surface-2" />
              </div>
            </div>
            <figcaption class="p-4 text-sm text-ink-2 space-y-1">
              <p>{{ 'photo.resultNote' | transloco }}</p>
              @for (l of store.garment()?.knownLimitations ?? []; track l) {
                <p class="text-muted">· {{ l | transloco }}</p>
              }
            </figcaption>
          </figure>
        } @else if (gen.status === 'queued' || gen.status === 'processing') {
          <ng-container [ngTemplateOutlet]="approxTpl" />
          <div class="card p-5 space-y-3" role="status" aria-live="polite">
            <p class="font-medium">{{ 'photo.generating' | transloco }}</p>
            <div class="h-0.5 bg-line overflow-hidden">
              <div class="h-full bg-ink transition-[width] duration-500" [style.width.%]="shownProgress() * 100"></div>
            </div>
            <p class="text-xs text-muted">{{ (gen.slow ? 'photo.slow' : 'photo.generatingHint') | transloco }}</p>
          </div>
        } @else if (gen.status === 'failed') {
          @let copy = failure();
          <ng-container [ngTemplateOutlet]="approxTpl" />
          <div class="card p-5 space-y-3" role="alert">
            <p class="font-medium">{{ 'photo.failed.title' | transloco }}</p>
            <p class="text-sm text-ink-2">{{ copy.body | transloco }}</p>
            <div class="flex flex-wrap gap-2">
              @if (copy.canRetry) {
                <button type="button" class="btn btn-primary" (click)="generate()">{{ 'common.retry' | transloco }}</button>
              }
              <button type="button" class="btn" (click)="fallbackTo.emit('similar-model')">{{ 'photo.fallback.similar' | transloco }}</button>
            </div>
          </div>
        } @else if (gen.status === 'fallback') {
          @let copy = failure();
          <ng-container [ngTemplateOutlet]="approxTpl" />
          <div class="card p-5 space-y-3" role="alert">
            <p class="font-medium">{{ 'photo.fallback.title' | transloco }}</p>
            <p class="text-sm text-ink-2">{{ copy.body | transloco }}</p>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn" (click)="fallbackTo.emit('similar-model')">{{ 'photo.fallback.similar' | transloco }}</button>
              @if (liveAvailable()) {
                <button type="button" class="btn" (click)="fallbackTo.emit('live-overlay')">{{ 'photo.fallback.live' | transloco }}</button>
              }
              @if (copy.canRetry) {
                <button type="button" class="btn btn-ghost" (click)="generate()">{{ 'common.retry' | transloco }}</button>
              }
            </div>
          </div>
        } @else {
          @let check = store.photoCheck();
          <ng-container [ngTemplateOutlet]="approxTpl" />
          <div class="card p-4 flex gap-4 items-center">
            @if (!approx()) {
              <img [src]="store.session()?.uploadedPhotoUrl" alt="" class="h-28 w-20 object-cover bg-surface-2" />
            }
            <div class="space-y-2">
              @if (check && !check.ok && check.reason) {
                <div role="status">
                  <p class="text-sm font-medium">{{ 'photo.check.title' | transloco }}</p>
                  <p class="text-sm text-ink-2">{{ 'photo.check.' + check.reason | transloco }}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="btn btn-primary" (click)="step.set('prepare')">{{ 'photo.check.another' | transloco }}</button>
                  <button type="button" class="btn" (click)="generate()">{{ 'photo.check.anyway' | transloco }}</button>
                </div>
              } @else {
                <p class="text-sm">{{ 'photo.readyToGenerate' | transloco }}</p>
                <button type="button" class="btn btn-primary" (click)="generate()">{{ 'photo.generate' | transloco }}</button>
              }
            </div>
          </div>
        }

        <div class="flex flex-wrap items-center gap-2 text-sm">
          @if (gen.status === 'done') {
            @if (auth.user()) {
              <button type="button" class="btn" (click)="store.saveResult()" [disabled]="saved()">
                {{ (saved() ? 'photo.saved' : 'photo.save') | transloco }}
              </button>
            } @else {
              <a routerLink="/cuenta" class="btn btn-ghost">{{ 'photo.saveNeedsAccount' | transloco }}</a>
            }
          }
          <button type="button" class="btn btn-ghost" (click)="deletePhoto()">{{ 'photo.delete' | transloco }}</button>
          @if (expiresAt(); as exp) {
            <span class="text-xs text-muted">{{ 'photo.expires' | transloco: { time: exp } }}</span>
          }
        </div>
      </div>
    } @else {
      @switch (step()) {
        @case ('intro') {
          <div class="card p-5 space-y-3">
            <p class="text-sm text-ink-2">{{ 'photo.intro' | transloco }}</p>
            <button type="button" class="btn btn-primary" (click)="step.set('checklist')">{{ 'photo.start' | transloco }}</button>
          </div>
        }
        @case ('checklist') {
          <app-privacy-checklist [ttlHours]="ttlHours()" (accepted)="step.set('prepare')" (cancelled)="cancelChecklist()" />
        }
        @case ('prepare') {
          <div class="card p-5 space-y-4">
            <div class="flex flex-wrap gap-2">
              <label class="btn">
                {{ 'photo.pickFile' | transloco }}
                <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" (change)="onFile($event)" />
              </label>
              <label class="btn">
                {{ 'photo.takePhoto' | transloco }}
                <input type="file" accept="image/*" capture="user" class="sr-only" (change)="onFile($event)" />
              </label>
            </div>

            <canvas #preview class="w-full max-h-[420px] object-contain bg-surface-2" [class.hidden]="!hasImage()"></canvas>
            @if (draftReason(); as reason) {
              <div class="text-sm" role="status">
                <p class="font-medium">{{ 'photo.check.title' | transloco }}</p>
                <p class="text-ink-2">{{ 'photo.check.' + reason | transloco }}</p>
              </div>
            }

            @if (hasImage()) {
              <fieldset class="space-y-2">
                <legend class="text-sm font-medium">{{ 'photo.face.legend' | transloco }}</legend>
                @if (!face()) {
                  <p class="text-xs text-muted">{{ 'photo.face.notFound' | transloco }}</p>
                }
                <ui-choice-group [options]="treatmentOptions()" [value]="treatment()" (valueChange)="treatment.set($event ?? 'keep')" [label]="'photo.face.legend' | transloco" />
              </fieldset>
              <label class="field">
                {{ 'photo.manualCrop' | transloco }}
                <input type="range" min="0" max="0.5" step="0.01" [value]="manualCrop()" (input)="onCrop($event)" />
              </label>
              <div class="flex gap-2">
                <button type="button" class="btn btn-primary" (click)="upload()">{{ 'photo.upload' | transloco }}</button>
                <button type="button" class="btn btn-ghost" (click)="reset()">{{ 'common.cancel' | transloco }}</button>
              </div>
            }
            @if (error()) {
              <p class="text-sm text-danger" role="alert">{{ error()! | transloco }}</p>
            }
          </div>
        }
        @case ('uploading') {
          <div class="card p-5" role="status">{{ 'photo.uploading' | transloco }}</div>
        }
      }
    }
  `,
})
export class PhotoTryOnComponent {
  readonly store = inject(TryOnSessionStore);
  readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  readonly fallbackTo = output<'similar-model' | 'live-overlay'>();

  readonly step = signal<Step>('intro');
  readonly ttlHours = signal(24);
  /** La foto entera va primero y es el valor por defecto: sin la cabeza, el motor de prueba deforma el resultado. */
  readonly liveAvailable = computed(() => {
    const g = this.store.garment();
    return !!g && canOverlay(g);
  });
  /** La propia foto con la prenda puesta por el motor de la cámara: sin IA, al instante. */
  readonly approx = computed(() => (this.liveAvailable() ? this.store.localPhoto() : null));
  readonly approxGarments = computed(() => {
    const g = this.store.garment();
    return g ? [g] : [];
  });
  /** Pose de la foto en preparación (`undefined` = aún sin medir o no se pudo medir). */
  readonly draftPose = signal<BodyPose | null | undefined>(undefined);
  /** Aviso de encuadre al instante, antes de subir, para lo que esta prenda necesita ver. */
  readonly draftReason = computed(() => {
    const pose = this.draftPose();
    const g = this.store.garment();
    return pose === undefined || !g || !this.hasImage() ? null : localPhotoReason(pose, g);
  });
  /** Texto y opción de reintentar según el motivo por el que no terminó la prueba. */
  readonly failure = computed(() => {
    const gen = this.store.generation();
    return failureCopy(gen.status === 'failed' ? 'failed' : 'fallback', gen.fallbackReason);
  });
  readonly treatments: FaceTreatment[] = ['keep', 'blur', 'crop'];
  readonly treatment = signal<FaceTreatment>('keep');
  readonly face = signal<FaceBox | null>(null);
  readonly manualCrop = signal(0);
  readonly hasImage = signal(false);
  readonly error = signal<string | null>(null);
  readonly now = signal(Date.now());

  private readonly transloco = inject(TranslocoService);
  private readonly dictionary = toSignal(this.transloco.selectTranslation());
  /** Sin rostro detectado solo se puede "mantener" (no hay nada que recortar ni difuminar). */
  readonly treatmentOptions = computed<ChoiceOption<FaceTreatment>[]>(() => {
    this.dictionary();
    return this.treatments.map((t) => ({ value: t, label: this.transloco.translate('photo.face.' + t), disabled: !this.face() && t !== 'keep' }));
  });

  readonly saved = computed(() => !!this.store.session()?.resultSaved);
  readonly expiresAt = computed(() => {
    const iso = this.store.session()?.photoExpiresAt;
    return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : null;
  });
  /** Progreso percibido: el servidor solo avisa inicio y fin; se anima con una curva honesta que nunca llega a 100%. */
  readonly shownProgress = computed(() => {
    const g = this.store.generation();
    const elapsed = g.startedAt ? (this.now() - (performance.timeOrigin + g.startedAt)) / 1000 : 0;
    return Math.max(g.progress, Math.min(0.95, 1 - Math.exp(-elapsed / (EXPECTED_SECONDS / 2))));
  });

  private readonly previewRef = viewChild<ElementRef<HTMLCanvasElement>>('preview');
  private bitmap: ImageBitmap | null = null;
  private readonly meter = new PhotoPoseMeter();
  private measureTimer?: ReturnType<typeof setTimeout>;
  private measureRun = 0;
  /** La foto vino de la cámara en vivo: tras subirla se genera directamente. */
  private fromCamera = false;

  constructor() {
    void this.api.privacyPolicy().then((p) => this.ttlHours.set(p.photoTtlHours)).catch(() => undefined);
    const timer = setInterval(() => {
      const s = this.store.generation().status;
      if (s === 'queued' || s === 'processing') this.now.set(Date.now());
    }, 400);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      clearTimeout(this.measureTimer);
      this.bitmap?.close();
      this.meter.dispose();
    });
    // Fotograma de la cámara («Foto realista»): primero la lista de privacidad, luego preparar y subir.
    const frame = this.store.cameraFrame();
    if (frame) {
      this.store.cameraFrame.set(null);
      this.fromCamera = true;
      void this.useImage(frame).then(() => this.step.set('checklist'));
    }
    // Re-dibuja la vista previa cuando cambian las opciones de privacidad.
    effect(() => {
      const opts = { treatment: this.treatment(), face: this.face(), manualCropTop: this.manualCrop() };
      const canvas = this.previewRef()?.nativeElement;
      if (this.hasImage() && this.bitmap && canvas) {
        renderPrepared(this.bitmap, canvas, opts);
        this.scheduleMeasure(canvas);
      }
    });
  }

  async onFile(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    (ev.target as HTMLInputElement).value = '';
    if (!file) return;
    this.error.set(null);
    if (file.size > 15 * 1024 * 1024) {
      this.error.set('photo.error.tooBig');
      return;
    }
    await this.useImage(file);
  }

  private async useImage(file: Blob) {
    try {
      this.bitmap?.close();
      this.bitmap = await loadBitmap(file);
    } catch {
      this.error.set('photo.error.unreadable');
      return;
    }
    const face = await detectFace(this.bitmap);
    this.face.set(face);
    this.treatment.set('keep');
    this.manualCrop.set(0);
    this.hasImage.set(true);
  }

  async upload() {
    const canvas = this.previewRef()?.nativeElement;
    if (!canvas || !this.bitmap) return;
    renderPrepared(this.bitmap, canvas, { treatment: this.treatment(), face: this.face(), manualCropTop: this.manualCrop() });
    this.step.set('uploading');
    try {
      // La pose se mide sobre la foto tal cual se sube (con el recorte y el difuminado elegidos).
      const [photo, pose] = await Promise.all([canvasToJpeg(canvas), this.meter.measure(canvas)]);
      await this.store.uploadPhoto(photo, pose);
      this.reset('ready');
      if (this.fromCamera) {
        this.fromCamera = false;
        this.generate();
      }
    } catch {
      this.step.set('prepare');
      this.error.set('photo.error.upload');
    }
  }

  /** Sin consentimiento, el fotograma de la cámara se descarta: nunca se sube. */
  cancelChecklist() {
    this.fromCamera = false;
    this.reset('intro');
  }

  generate() {
    void this.store.generate();
  }

  async deletePhoto() {
    if (await this.store.deletePhoto()) this.reset('intro');
  }

  onCrop(ev: Event) {
    this.manualCrop.set(Number((ev.target as HTMLInputElement).value));
  }

  /** Mide la pose un momento después del último cambio de recorte, no en cada movimiento del control. */
  private scheduleMeasure(canvas: HTMLCanvasElement) {
    clearTimeout(this.measureTimer);
    const run = ++this.measureRun;
    this.measureTimer = setTimeout(() => {
      void this.meter.measure(canvas).then((pose) => {
        if (run === this.measureRun) this.draftPose.set(pose);
      });
    }, 250);
  }

  reset(step: Step = 'intro') {
    this.bitmap?.close();
    this.bitmap = null;
    this.hasImage.set(false);
    this.face.set(null);
    this.measureRun++;
    this.draftPose.set(undefined);
    this.step.set(step);
  }
}
