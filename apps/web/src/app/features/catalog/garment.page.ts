import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { PoseRatios, TryOnMode } from '@vestirse/shared-types';
import { CartStore } from '../../core/cart.store';
import { ComparisonStore } from '../../core/comparison/comparison.store';
import { NoticeStore } from '../../core/notice.store';
import { canvasToBlob } from '../../core/frame-export';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import { SoundService } from '../../core/sound';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { PricePipe } from '../../shared/price.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { TabsComponent, type TabItem } from '../../shared/ui/tabs.component';
import { FitPanelComponent } from '../fit-engine/fit-panel.component';
import { LiveTryOnComponent } from '../live-overlay/live-tryon.component';
import type { Fit } from '../live-overlay/engine/rig';
import { fitForSize } from '../live-overlay/engine/size-fit';
import { canWear } from '../live-overlay/engine/tryon-scene';
import { canOverlay } from '../live-overlay/overlay-geometry';
import { PhotoTryOnComponent } from '../photo-upload/photo-tryon.component';
import { ReviewsPanelComponent } from '../reviews/reviews-panel.component';
import { ApproxViewComponent } from './approx-view.component';
import { BodyPickerComponent } from './body-picker.component';
import { GarmentGalleryComponent } from './garment-gallery.component';
import { PairsWithComponent } from '../look/pairs-with.component';
import { describeLook } from '../look/look-description';

/**
 * Página de prenda: las tres capas conviven, ninguna es obligatoria para comprar (sección 2).
 * El modo por defecto es el que no pide nada: cuerpo similar.
 */
@Component({
  selector: 'app-garment-page',
  imports: [RouterLink, TranslocoPipe, PricePipe, IconComponent, RevealDirective, SkeletonComponent, TabsComponent, ApproxViewComponent, BodyPickerComponent, FitPanelComponent, GarmentGalleryComponent, PairsWithComponent, LiveTryOnComponent, PhotoTryOnComponent, ReviewsPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    /* Mismo fondo que el lienzo de las fotos de catálogo: la foto no se ve "pegada". */
    .stage {
      background: #f6f5f2;
      border-radius: var(--radius-card);
    }
    .badge {
      position: absolute;
      top: 12px;
      right: 12px;
      border-radius: 9999px;
      background: rgb(255 255 255 / 0.92);
      padding: 4px 10px;
      color: #0b0b0b;
    }
    /* Bloques plegables al estilo de una ficha de moda: título mono y un + que gira. */
    .acc {
      border-top: 1px solid var(--line);
    }
    .acc > summary {
      display: flex;
      min-height: 56px;
      cursor: pointer;
      list-style: none;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .acc > summary::-webkit-details-marker {
      display: none;
    }
    .acc > summary ui-icon {
      transition: transform 0.5s var(--ease-film);
    }
    .acc[open] > summary ui-icon {
      transform: rotate(45deg);
    }
    /* El título del panel ya está en el resumen: se oculta a la vista, no a los lectores de pantalla. */
    .acc-body ::ng-deep h2:first-of-type {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .acc[open] > .acc-body {
      animation: fade-up 0.6s var(--ease-out) both;
    }
  `,
  template: `
    <div class="mx-auto max-w-screen-2xl px-3 pt-4 pb-20 md:px-4">
      <nav [attr.aria-label]="'garment.breadcrumb' | transloco" class="mono flex min-h-11 items-center gap-2 px-1 text-muted">
        <a routerLink="/tienda" class="inline-flex items-center gap-2 hover:text-ink"><ui-icon name="arrow-left" [size]="16" />{{ 'nav.catalog' | transloco }}</a>
        @if (store.garment(); as g) {
          <span aria-hidden="true">/</span><span>{{ 'category.' + g.category | transloco }}</span>
        }
      </nav>

      @if (store.error()) {
        <div class="mt-4 border border-line p-8 text-center" role="alert">
          <p>{{ 'common.loadError' | transloco }}</p>
          <button type="button" class="btn mt-4" (click)="load(id())">{{ 'common.retry' | transloco }}</button>
        </div>
      } @else if (store.garment(); as g) {
        <div class="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10">
          <!-- Escenario visual -->
          <section class="min-w-0 space-y-4" [attr.aria-label]="'garment.stage' | transloco" appReveal>
            <ui-tabs #tabs [items]="modeTabs()" [active]="store.mode()" (activeChange)="setMode($event)" [label]="'garment.stage' | transloco" [stretch]="true" />

            <div role="tabpanel" [id]="tabs.panelId(store.mode())" [attr.aria-labelledby]="tabs.tabId(store.mode())">
              @switch (store.mode()) {
                @case ('similar-model') {
                  <div class="stage relative h-[min(78vh,720px)] overflow-hidden">
                    @if (!store.modelPreview() && approxBody(); as b) {
                      <app-approx-view class="block h-full" [body]="b" [garments]="approxGarments()" [fits]="approxFits()" (placed)="approxPlaced.set($event)" />
                      <p class="badge mono">{{ 'body.approxPreview' | transloco }}</p>
                      <p class="sr-only" aria-live="polite">{{ approxDescription() }}</p>
                    } @else {
                      <img [src]="store.previewImage()" [alt]="g.name" class="absolute inset-0 h-full w-full object-contain p-[4%]" />
                    }
                    @if (store.modelPreview()) {
                      <p class="badge mono">{{ 'body.aiPreview' | transloco }}</p>
                    }
                    <p class="mono pointer-events-none absolute bottom-3 left-4 text-black/45">{{ g.brandName }} — {{ g.color }}</p>
                    @if (store.modelPreviewState() === 'generating') {
                      <div class="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px]" role="status">
                        <p class="mono rounded-full bg-black px-4 py-2.5 text-white">{{ 'body.generating' | transloco }}</p>
                      </div>
                    }
                  </div>
                  @if (!store.selectedBody()) {
                    <p class="mt-3 text-[13px] text-ink-2">{{ 'body.chooseToSee' | transloco }}</p>
                  } @else if (approxBody() && approxPlaced() === 0) {
                    <p class="mt-3 text-[13px] text-ink-2">{{ 'body.approxFailed' | transloco }}</p>
                  } @else if (!store.wearable()) {
                    @if (!approxBody()) {
                      <p class="mt-3 text-[13px] text-ink-2">{{ 'body.notWearable' | transloco }}</p>
                    }
                  } @else if (!store.aiCanDressBody()) {
                    <p class="mt-3 text-[13px] text-ink-2">{{ (store.selectedBody()?.onePiece ? 'body.onePiece' : 'body.handsInPockets') | transloco }}</p>
                  } @else if (!store.modelPreview()) {
                    <div class="mt-3 flex flex-wrap items-center gap-3">
                      <button type="button" class="btn btn-primary" [disabled]="store.modelPreviewState() === 'generating'" (click)="store.generateModelPreview()">
                        {{ 'body.generate' | transloco }}
                      </button>
                      <p class="min-w-0 flex-1 text-[13px] text-ink-2" aria-live="polite">
                        @switch (store.modelPreviewState()) {
                          @case ('busy') {{{ 'body.generateBusy' | transloco }}}
                          @case ('failed') {{{ 'body.generateFailed' | transloco }}}
                          @default {{{ (approxBody() ? 'body.approxHelp' : 'body.generateHelp') | transloco }}}
                        }
                      </p>
                    </div>
                  }
                  <div class="mt-4">
                    <app-body-picker />
                  </div>
                }
                @case ('live-overlay') {
                  <app-live-tryon [garment]="g" [recommendedSize]="store.chosenSize() ?? undefined" [realistic]="store.wearable()" (poseRatios)="onPoseRatios($event)" (realisticFrame)="onRealisticFrame($event)" [measure]="true" [measuring]="store.measuring()" (measureFrame)="onMeasureFrame($event)" />
                }
                @case ('photorealistic') {
                  <app-photo-tryon (fallbackTo)="setMode($event)" />
                }
              }
            </div>
            <p class="mono text-muted normal-case">{{ 'mode.note.' + store.mode() | transloco }}</p>
            <app-garment-gallery [garment]="g" [bodies]="store.bodyModels()" />
          </section>

          <!-- Información, talla y contexto -->
          <section class="min-w-0 lg:sticky lg:top-20 lg:self-start" appReveal [revealDelay]="120">
            <header class="pb-7">
              <p class="mono flex items-center gap-2 text-muted">
                <span>{{ g.brandName }}</span><span aria-hidden="true">/</span><span>{{ 'category.' + g.category | transloco }}</span>
              </p>
              <h1 class="display mt-4 text-[clamp(36px,4.6vw,68px)]">{{ g.name }}</h1>
              <div class="mono mt-5 flex items-center justify-between gap-4">
                <p class="text-[14px] text-ink tabular">{{ g.priceCents | price }}</p>
                <p class="text-muted">{{ g.color }}</p>
              </div>
            </header>

            <div class="card p-5 md:p-6">
              <app-fit-panel />
            </div>

            <div class="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
              <button type="button" class="btn btn-primary h-14 text-[13px]" (click)="addToCart()">
                <ui-icon name="bag" [size]="16" />{{ 'cart.add' | transloco }}@if (store.chosenSize(); as size) {<span> · {{ size }}</span>}
              </button>
              <button type="button" class="btn h-14" [class.btn-primary]="inComparison()" [attr.aria-pressed]="inComparison()" (click)="toggleCompare()">
                @if (inComparison()) {<ui-icon name="check" [size]="16" />}
                {{ (inComparison() ? 'compare.remove' : 'compare.add') | transloco }}
              </button>
            </div>
            @if (inCart() || comparison.count() > 0) {
              <div class="mono mt-3 flex flex-wrap gap-x-6 gap-y-2">
                @if (inCart()) {
                  <a routerLink="/carrito" class="link-line">{{ 'cart.open' | transloco: { n: cart.count() } }}</a>
                }
                @if (comparison.count() > 0) {
                  <a routerLink="/comparar" class="link-line">{{ 'compare.open' | transloco: { n: comparison.count() } }}</a>
                }
              </div>
            }

            <div class="mt-8 border-b border-line">
              <details class="acc" open>
                <summary class="mono">{{ 'look.goesWithTitle' | transloco }}<ui-icon name="plus" [size]="16" /></summary>
                <div class="acc-body pb-6"><app-pairs-with [garment]="g" [bodyId]="store.selectedBodyId()" /></div>
              </details>
              <details class="acc">
                <summary class="mono">{{ 'reviews.title' | transloco }}<ui-icon name="plus" [size]="16" /></summary>
                <div class="acc-body pb-6"><app-reviews-panel [garment]="g" /></div>
              </details>
            </div>
          </section>
        </div>
      } @else {
        <p class="sr-only" role="status">{{ 'common.loading' | transloco }}</p>
        <div class="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10" aria-hidden="true">
          <ui-skeleton class="block h-[min(78vh,720px)] overflow-hidden rounded-[16px]" />
          <div class="space-y-4"><ui-skeleton class="h-3 w-24" /><ui-skeleton class="h-7 w-2/3" /><ui-skeleton class="h-4 w-20" /><ui-skeleton class="mt-8 h-40" /></div>
        </div>
      }
    </div>
  `,
})
export class GarmentPage {
  /** Vinculado desde la ruta (withComponentInputBinding). */
  readonly id = input.required<string>();
  readonly store = inject(TryOnSessionStore);
  readonly comparison = inject(ComparisonStore);
  readonly cart = inject(CartStore);
  private readonly notices = inject(NoticeStore);
  private readonly sound = inject(SoundService);
  readonly modes: TryOnMode[] = ['similar-model', 'live-overlay', 'photorealistic'];

  private readonly transloco = inject(TranslocoService);
  /** Emite cuando el diccionario del idioma activo está cargado (también al cambiar de idioma). */
  private readonly dictionary = toSignal(this.transloco.selectTranslation());
  /** Solo se ofrecen los modos que esta prenda admite: sin recorte no hay cámara; calzado y accesorios no se visten con IA. */
  readonly availableModes = computed<TryOnMode[]>(() => {
    const g = this.store.garment();
    if (!g) return ['similar-model'];
    return this.modes.filter((m) => {
      if (m === 'live-overlay') return canOverlay(g);
      if (m === 'photorealistic') return this.store.wearable();
      return true;
    });
  });
  readonly modeTabs = computed<TabItem<TryOnMode>[]>(() => {
    this.dictionary();
    return this.availableModes().map((m) => ({ id: m, label: this.transloco.translate('mode.' + m) }));
  });

  /** Modelo elegido sobre el que se puede vestir la prenda al instante (tiene pose medida y la prenda, recorte y anclas). */
  readonly approxBody = computed(() => {
    const g = this.store.garment();
    const body = this.store.selectedBody();
    return g && body?.pose && canWear(g) ? body : null;
  });
  readonly approxGarments = computed(() => {
    const g = this.store.garment();
    return g ? [g] : [];
  });
  /** La talla elegida vista sobre un cuerpo que suele usar su talla típica. */
  readonly approxFits = computed<Record<string, Fit>>(() => {
    const g = this.store.garment();
    const body = this.approxBody();
    if (!g || !body) return {};
    return { [g.id]: fitForSize(g.sizeChart.map((s) => s.size), body.typicalSize, this.store.chosenSize() ?? undefined) };
  });
  readonly approxPlaced = signal(-1);
  /** Lo mismo que se ve, en palabras: prenda, talla, holgura y modelo. */
  readonly approxDescription = computed(() => {
    this.dictionary();
    const g = this.store.garment();
    const size = this.store.chosenSize() ?? undefined;
    return g ? describeLook([g], this.approxBody(), (k, p) => this.transloco.translate(k, p), { [g.id]: { size, fit: this.approxFits()[g.id] } }) : '';
  });

  readonly inCart = computed(() => {
    const g = this.store.garment();
    return !!g && this.cart.items().some((i) => i.garmentId === g.id);
  });

  readonly inComparison = computed(() => {
    const g = this.store.garment();
    return !!g && this.comparison.items().some((i) => i.garmentId === g.id);
  });

  constructor() {
    const title = inject(Title);
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    effect(() => {
      const g = this.store.garment();
      if (g) title.setTitle(`${g.name} · Vestirse`);
    });
  }

  load(id: string) {
    this.store.error.set(null);
    this.store.garment.set(null);
    this.store.loadGarment(id).catch(() => this.store.error.set('load'));
  }

  setMode(m: TryOnMode) {
    void this.store.setMode(m);
  }

  onPoseRatios(r: PoseRatios) {
    this.store.poseRatios.set(r);
  }

  /** «Foto realista» desde la cámara: pasa al modo con foto, que pide consentimiento antes de subir nada. */
  async onRealisticFrame(frame: HTMLCanvasElement) {
    const blob = await canvasToBlob(frame);
    if (!blob) return;
    this.store.cameraFrame.set(blob);
    this.setMode('photorealistic');
  }

  /** «Medirme con IA» desde la cámara: un solo fotograma, enviado una vez y no guardado. */
  async onMeasureFrame(frame: HTMLCanvasElement) {
    const blob = await canvasToBlob(frame);
    if (!blob) return;
    const result = await this.store.measureWithAi({ photo: blob });
    if (result === 'need-height') this.notices.info('measure.needHeight');
    else if (result?.usable) this.notices.success('measure.done');
    else if (result) this.notices.info('measure.unusable');
  }

  addToCart() {
    const g = this.store.garment();
    if (!g) return;
    this.sound.play('shutter');
    if (this.cart.add(g.id, this.store.chosenSize())) this.notices.success('cart.added');
    else this.notices.info('cart.already');
  }

  toggleCompare() {
    const g = this.store.garment();
    if (!g) return;
    if (this.inComparison()) {
      this.comparison.remove(g.id);
      return;
    }
    this.comparison.add({
      garmentId: g.id,
      name: g.name,
      brandName: g.brandName,
      imageUrl: this.store.previewImage() ?? g.images.photo,
      size: this.store.chosenSize(),
      sessionId: this.store.session()?.id,
    });
  }
}
