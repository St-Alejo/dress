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
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import { ChoiceGroupComponent, type ChoiceOption } from '../../shared/ui/choice-group.component';
import { PrivacyChecklistComponent } from './privacy-checklist.component';
import { canvasToJpeg, detectFace, loadBitmap, renderPrepared, type FaceBox, type FaceTreatment } from './photo-prep';

type Step = 'intro' | 'checklist' | 'prepare' | 'uploading' | 'ready';

/** Tiempo típico de generación (s), solo para animar el progreso percibido con honestidad. */
const EXPECTED_SECONDS = 20;

@Component({
  selector: 'app-photo-tryon',
  imports: [TranslocoPipe, PrivacyChecklistComponent, RouterLink, ChoiceGroupComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let gen = store.generation();
    @if (store.hasPhoto() && step() !== 'prepare' && step() !== 'checklist') {
      <!-- Foto ya subida: generar, ver resultado o fallback -->
      <div class="space-y-4">
        @if (gen.status === 'done' && store.resultImageUrl()) {
          <figure class="card overflow-hidden">
            <img [src]="store.resultImageUrl()" [alt]="'photo.resultAlt' | transloco" class="w-full" />
            <figcaption class="p-4 text-sm text-ink-2 space-y-1">
              <p>{{ 'photo.resultNote' | transloco }}</p>
              @for (l of store.garment()?.knownLimitations ?? []; track l) {
                <p class="text-muted">· {{ l | transloco }}</p>
              }
            </figcaption>
          </figure>
        } @else if (gen.status === 'queued' || gen.status === 'processing') {
          <div class="card p-5 space-y-3" role="status" aria-live="polite">
            <p class="font-medium">{{ 'photo.generating' | transloco }}</p>
            <div class="h-0.5 bg-line overflow-hidden">
              <div class="h-full bg-ink transition-[width] duration-500" [style.width.%]="shownProgress() * 100"></div>
            </div>
            <p class="text-xs text-muted">{{ 'photo.generatingHint' | transloco }}</p>
          </div>
        } @else if (gen.status === 'failed') {
          <div class="card p-5 space-y-3" role="alert">
            <p class="font-medium">{{ 'photo.failed.title' | transloco }}</p>
            <p class="text-sm text-ink-2">{{ 'photo.failed.body' | transloco }}</p>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-primary" (click)="generate()">{{ 'common.retry' | transloco }}</button>
              <button type="button" class="btn" (click)="fallbackTo.emit('similar-model')">{{ 'photo.fallback.similar' | transloco }}</button>
            </div>
          </div>
        } @else if (gen.status === 'fallback') {
          <div class="card p-5 space-y-3" role="alert">
            <p class="font-medium">{{ 'photo.fallback.title' | transloco }}</p>
            <p class="text-sm text-ink-2">{{ 'photo.fallback.body' | transloco }}</p>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn" (click)="fallbackTo.emit('similar-model')">{{ 'photo.fallback.similar' | transloco }}</button>
              <button type="button" class="btn" (click)="fallbackTo.emit('live-overlay')">{{ 'photo.fallback.live' | transloco }}</button>
              <button type="button" class="btn btn-ghost" (click)="generate()">{{ 'common.retry' | transloco }}</button>
            </div>
          </div>
        } @else {
          <div class="card p-4 flex gap-4 items-center">
            <img [src]="store.session()?.uploadedPhotoUrl" alt="" class="h-28 w-20 object-cover bg-surface-2" />
            <div class="space-y-2">
              <p class="text-sm">{{ 'photo.readyToGenerate' | transloco }}</p>
              <button type="button" class="btn btn-primary" (click)="generate()">{{ 'photo.generate' | transloco }}</button>
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
          <app-privacy-checklist [ttlHours]="ttlHours()" (accepted)="step.set('prepare')" (cancelled)="step.set('intro')" />
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
  readonly treatments: FaceTreatment[] = ['crop', 'blur', 'keep'];
  readonly treatment = signal<FaceTreatment>('crop');
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

  constructor() {
    void this.api.privacyPolicy().then((p) => this.ttlHours.set(p.photoTtlHours)).catch(() => undefined);
    const timer = setInterval(() => {
      const s = this.store.generation().status;
      if (s === 'queued' || s === 'processing') this.now.set(Date.now());
    }, 400);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.bitmap?.close();
    });
    // Re-dibuja la vista previa cuando cambian las opciones de privacidad.
    effect(() => {
      const opts = { treatment: this.treatment(), face: this.face(), manualCropTop: this.manualCrop() };
      const canvas = this.previewRef()?.nativeElement;
      if (this.hasImage() && this.bitmap && canvas) renderPrepared(this.bitmap, canvas, opts);
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
    try {
      this.bitmap?.close();
      this.bitmap = await loadBitmap(file);
    } catch {
      this.error.set('photo.error.unreadable');
      return;
    }
    const face = await detectFace(this.bitmap);
    this.face.set(face);
    this.treatment.set(face ? 'crop' : 'keep');
    this.manualCrop.set(0);
    this.hasImage.set(true);
  }

  async upload() {
    const canvas = this.previewRef()?.nativeElement;
    if (!canvas || !this.bitmap) return;
    renderPrepared(this.bitmap, canvas, { treatment: this.treatment(), face: this.face(), manualCropTop: this.manualCrop() });
    this.step.set('uploading');
    try {
      await this.store.uploadPhoto(await canvasToJpeg(canvas));
      this.reset('ready');
    } catch {
      this.step.set('prepare');
      this.error.set('photo.error.upload');
    }
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

  reset(step: Step = 'intro') {
    this.bitmap?.close();
    this.bitmap = null;
    this.hasImage.set(false);
    this.face.set(null);
    this.step.set(step);
  }
}
