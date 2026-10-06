import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { PoseRatios, TryOnMode } from '@vestirse/shared-types';
import { ComparisonStore } from '../../core/comparison/comparison.store';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import { PricePipe } from '../../shared/price.pipe';
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
  imports: [RouterLink, TranslocoPipe, PricePipe, BodyPickerComponent, FitPanelComponent, LiveTryOnComponent, PhotoTryOnComponent, ReviewsPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-6xl px-4 pt-4 pb-16">
      <a routerLink="/" class="btn btn-ghost -ml-3 text-sm">← {{ 'nav.catalog' | transloco }}</a>

      @if (store.error()) {
        <div class="card p-5 mt-4 space-y-3" role="alert">
          <p>{{ 'common.loadError' | transloco }}</p>
          <button type="button" class="btn" (click)="load(id())">{{ 'common.retry' | transloco }}</button>
        </div>
      } @else if (store.garment(); as g) {
        <div class="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <!-- Escenario visual -->
          <section class="space-y-4" [attr.aria-label]="'garment.stage' | transloco">
            <div class="flex gap-1 rounded-full bg-[var(--surface-2)] p-1" role="tablist">
              @for (m of modes; track m) {
                <button type="button" role="tab" class="flex-1 rounded-full px-3 py-2 text-sm font-medium transition min-h-[44px]"
                  [class.bg-[var(--surface)]]="store.mode() === m" [class.shadow]="store.mode() === m"
                  [attr.aria-selected]="store.mode() === m" (click)="setMode(m)">
                  {{ 'mode.' + m | transloco }}
                </button>
              }
            </div>

            @switch (store.mode()) {
              @case ('similar-model') {
                <div class="card overflow-hidden">
                  <div class="h-[min(68vh,600px)] bg-[var(--surface-2)] grid place-items-center">
                    <img [src]="store.previewImage()" [alt]="g.name" class="h-full w-full object-contain p-4" />
                  </div>
                  @if (!store.selectedBody()) {
                    <p class="px-4 pt-3 text-sm text-[var(--ink-2)]">{{ 'body.chooseToSee' | transloco }}</p>
                  }
                  <div class="p-4">
                    <app-body-picker />
                  </div>
                </div>
              }
              @case ('live-overlay') {
                <app-live-tryon [garment]="g" (poseRatios)="onPoseRatios($event)" />
              }
              @case ('photorealistic') {
                <app-photo-tryon (fallbackTo)="setMode($event)" />
              }
            }
            <p class="text-xs text-[var(--muted)]">{{ 'mode.note.' + store.mode() | transloco }}</p>
          </section>

          <!-- Información, talla y contexto -->
          <section class="space-y-4">
            <header>
              <p class="text-sm text-[var(--muted)]">{{ g.brandName }} · {{ 'category.' + g.category | transloco }}</p>
              <h1 class="mt-1 text-3xl">{{ g.name }}</h1>
              <p class="mt-2 text-lg">{{ g.priceCents | price }}</p>
            </header>

            <app-fit-panel />

            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn" (click)="toggleCompare()">
                {{ (inComparison() ? 'compare.remove' : 'compare.add') | transloco }}
              </button>
              @if (comparison.count() > 0) {
                <a routerLink="/comparar" class="btn btn-ghost">{{ 'compare.open' | transloco: { n: comparison.count() } }}</a>
              }
            </div>

            <app-reviews-panel [garment]="g" />
          </section>
        </div>
      } @else {
        <p class="mt-10 text-[var(--muted)]" role="status">{{ 'common.loading' | transloco }}</p>
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
