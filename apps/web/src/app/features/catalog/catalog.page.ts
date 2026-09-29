import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Brand, GarmentCategory, GarmentItem, SimilarBodyModel } from '@vestirse/shared-types';
import { ApiService } from '../../core/api.service';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import { PricePipe } from '../../shared/price.pipe';

@Component({
  selector: 'app-catalog-page',
  imports: [RouterLink, TranslocoPipe, PricePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-6xl px-4 pt-8 pb-16">
      <header class="max-w-2xl">
        <p class="eyebrow">{{ 'catalog.eyebrow' | transloco }}</p>
        <h1 class="mt-2 text-3xl sm:text-4xl">{{ 'catalog.title' | transloco }}</h1>
        <p class="mt-3 text-[var(--ink-2)]">{{ 'catalog.lead' | transloco }}</p>
      </header>

      <div class="mt-6 flex flex-wrap items-center gap-2" role="toolbar" [attr.aria-label]="'catalog.filters' | transloco">
        <button type="button" class="chip" [attr.aria-pressed]="!category()" (click)="category.set(null)">{{ 'catalog.all' | transloco }}</button>
        @for (c of categories; track c) {
          <button type="button" class="chip" [attr.aria-pressed]="category() === c" (click)="category.set(c)">{{ 'category.' + c | transloco }}</button>
        }
        <select class="chip pr-8" [attr.aria-label]="'catalog.brand' | transloco" (change)="brandId.set($any($event.target).value || null)">
          <option value="">{{ 'catalog.allBrands' | transloco }}</option>
          @for (b of brands(); track b.id) {<option [value]="b.id">{{ b.name }}</option>}
        </select>
        <input type="search" class="chip min-w-[180px] grow sm:grow-0" [placeholder]="'catalog.search' | transloco" [attr.aria-label]="'catalog.search' | transloco"
          (input)="q.set($any($event.target).value)" />
      </div>

      @if (selectedBody(); as body) {
        <p class="mt-4 text-sm text-[var(--ink-2)]">
          {{ 'catalog.showingOn' | transloco }} <strong>{{ 'body.tag.' + body.bodyTypeTag | transloco }}</strong> ·
          {{ body.heightRangeCm[0] }}–{{ body.heightRangeCm[1] }} cm
        </p>
      }

      @if (loading()) {
        <p class="mt-10 text-[var(--muted)]" role="status">{{ 'common.loading' | transloco }}</p>
      } @else if (error()) {
        <div class="mt-10 card p-5" role="alert">
          <p>{{ 'common.loadError' | transloco }}</p>
          <button type="button" class="btn mt-3" (click)="load()">{{ 'common.retry' | transloco }}</button>
        </div>
      } @else if (visible().length === 0) {
        <p class="mt-10 text-[var(--muted)]">{{ 'catalog.empty' | transloco }}</p>
      } @else {
        <ul class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          @for (g of visible(); track g.id) {
            <li>
              <a [routerLink]="['/prenda', g.id]" class="card group block overflow-hidden transition hover:-translate-y-0.5">
                <div class="aspect-[3/4] bg-[var(--surface-2)] grid place-items-center overflow-hidden">
                  <img [src]="imageFor(g)" [alt]="g.name" loading="lazy" class="h-full w-full object-contain p-2 transition group-hover:scale-[1.02]" />
                </div>
                <div class="p-3">
                  <p class="text-xs text-[var(--muted)]">{{ g.brandName }}</p>
                  <p class="font-medium leading-snug">{{ g.name }}</p>
                  <p class="mt-1 text-sm">{{ g.priceCents | price }}</p>
                </div>
              </a>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class CatalogPage {
  private readonly api = inject(ApiService);
  private readonly store = inject(TryOnSessionStore);

  readonly categories: GarmentCategory[] = ['top', 'bottom', 'dress', 'outerwear', 'footwear', 'accessory'];
  readonly category = signal<GarmentCategory | null>(null);
  readonly brandId = signal<string | null>(null);
  readonly q = signal('');
  readonly garments = signal<GarmentItem[]>([]);
  readonly brands = signal<Brand[]>([]);
  readonly bodies = signal<SimilarBodyModel[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);

  readonly selectedBody = computed(() => this.bodies().find((b) => b.id === this.store.selectedBodyId()) ?? null);
  readonly visible = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.garments().filter(
      (g) =>
        (!this.category() || g.category === this.category()) &&
        (!this.brandId() || g.brandId === this.brandId()) &&
        (!q || g.name.toLowerCase().includes(q)),
    );
  });

  constructor() {
    void this.load();
  }

  /** Si la persona ya eligió un cuerpo parecido al suyo, el catálogo entero se muestra sobre ese cuerpo. */
  imageFor(g: GarmentItem) {
    return this.selectedBody()?.previewImages[g.id] ?? g.images.flat;
  }

  async load() {
    this.loading.set(true);
    this.error.set(false);
    try {
      const [garments, brands, bodies] = await Promise.all([this.api.garments(), this.api.brands(), this.api.bodyModels()]);
      this.garments.set(garments);
      this.brands.set(brands);
      this.bodies.set(bodies);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
