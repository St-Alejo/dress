import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { PoseRatios, TryOnMode } from '@vestirse/shared-types';
import { ComparisonStore } from '../../core/comparison/comparison.store';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import { PricePipe } from '../../shared/price.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { TabsComponent, type TabItem } from '../../shared/ui/tabs.component';
import { FitPanelComponent } from '../fit-engine/fit-panel.component';
import { LiveTryOnComponent } from '../live-overlay/live-tryon.component';
import { PhotoTryOnComponent } from '../photo-upload/photo-tryon.component';
import { ReviewsPanelComponent } from '../reviews/reviews-panel.component';
import { BodyPickerComponent } from './body-picker.component';

/**
 * Página de prenda: las tres capas conviven, ninguna es obligatoria para comprar (sección 2).
 * El modo por defecto es el que no pide nada: cuerpo similar.
 */
@Component({
  selector: 'app-garment-page',
  imports: [RouterLink, TranslocoPipe, PricePipe, IconComponent, SkeletonComponent, TabsComponent, BodyPickerComponent, FitPanelComponent, LiveTryOnComponent, PhotoTryOnComponent, ReviewsPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-screen-2xl px-4 pt-4 pb-16 md:px-8">
      <nav [attr.aria-label]="'garment.breadcrumb' | transloco" class="flex min-h-11 items-center gap-2 text-[12px] uppercase tracking-[0.08em] text-muted">
        <a routerLink="/" class="inline-flex items-center gap-2 hover:text-ink"><ui-icon name="arrow-left" [size]="16" />{{ 'nav.catalog' | transloco }}</a>
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
        <div class="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-12">
          <!-- Escenario visual -->
          <section class="min-w-0 space-y-4" [attr.aria-label]="'garment.stage' | transloco">
            <ui-tabs #tabs [items]="modeTabs()" [active]="store.mode()" (activeChange)="setMode($event)" [label]="'garment.stage' | transloco" [stretch]="true" />

            <div role="tabpanel" [id]="tabs.panelId(store.mode())" [attr.aria-labelledby]="tabs.tabId(store.mode())">
              @switch (store.mode()) {
                @case ('similar-model') {
                  <div class="relative h-[min(70vh,640px)] overflow-hidden bg-surface-2">
                    <img [src]="store.previewImage()" [alt]="g.name" class="absolute inset-0 h-full w-full object-contain p-6" />
                  </div>
                  @if (!store.selectedBody()) {
                    <p class="mt-3 text-[13px] text-ink-2">{{ 'body.chooseToSee' | transloco }}</p>
                  }
                  <div class="mt-4">
                    <app-body-picker />
                  </div>
                }
                @case ('live-overlay') {
                  <app-live-tryon [garment]="g" (poseRatios)="onPoseRatios($event)" />
                }
                @case ('photorealistic') {
                  <app-photo-tryon (fallbackTo)="setMode($event)" />
                }
              }
            </div>
            <p class="text-[12px] text-muted">{{ 'mode.note.' + store.mode() | transloco }}</p>
          </section>

          <!-- Información, talla y contexto -->
          <section class="min-w-0 lg:sticky lg:top-20 lg:self-start">
            <header class="border-b border-line pb-6">
              <p class="label-xs">{{ g.brandName }}</p>
              <h1 class="mt-2 text-[24px] md:text-[28px]">{{ g.name }}</h1>
              <p class="mt-3 text-[16px] tabular">{{ g.priceCents | price }}</p>
            </header>

            <div class="border-b border-line py-6">
              <app-fit-panel />
            </div>

            <div class="flex flex-wrap items-center gap-4 border-b border-line py-6">
              <button type="button" class="btn" [class.btn-primary]="inComparison()" [attr.aria-pressed]="inComparison()" (click)="toggleCompare()">
                @if (inComparison()) {<ui-icon name="check" [size]="16" />}
                {{ (inComparison() ? 'compare.remove' : 'compare.add') | transloco }}
              </button>
              @if (comparison.count() > 0) {
                <a routerLink="/comparar" class="btn btn-ghost">{{ 'compare.open' | transloco: { n: comparison.count() } }}</a>
              }
            </div>

            <div class="py-6">
              <app-reviews-panel [garment]="g" />
            </div>
          </section>
        </div>
      } @else {
        <p class="sr-only" role="status">{{ 'common.loading' | transloco }}</p>
        <div class="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-12" aria-hidden="true">
          <ui-skeleton class="h-[min(70vh,640px)]" />
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
  readonly modes: TryOnMode[] = ['similar-model', 'live-overlay', 'photorealistic'];

  private readonly transloco = inject(TranslocoService);
  /** Emite cuando el diccionario del idioma activo está cargado (también al cambiar de idioma). */
  private readonly dictionary = toSignal(this.transloco.selectTranslation());
  readonly modeTabs = computed<TabItem<TryOnMode>[]>(() => {
    this.dictionary();
    return this.modes.map((m) => ({ id: m, label: this.transloco.translate('mode.' + m) }));
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
      imageUrl: this.store.previewImage() ?? g.images.front,
      size: this.store.chosenSize(),
      sessionId: this.store.session()?.id,
    });
  }
}
