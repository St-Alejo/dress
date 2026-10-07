import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Brand, GarmentCategory, GarmentItem, SimilarBodyModel } from '@vestirse/shared-types';
import { ApiService } from '../../core/api.service';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import { PricePipe } from '../../shared/price.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';

@Component({
  selector: 'app-catalog-page',
  imports: [RouterLink, TranslocoPipe, PricePipe, IconComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-screen-2xl px-4 pt-8 pb-16 md:px-8">
      <header class="max-w-2xl">
        <h1 class="text-[28px] md:text-[40px]">{{ 'catalog.title' | transloco }}</h1>
        <p class="mt-3 max-w-xl text-[14px] text-ink-2">{{ 'catalog.lead' | transloco }}</p>
      </header>

      <div class="mt-8 flex flex-col gap-4 border-b border-line md:flex-row md:items-end md:justify-between">
        <div class="-mb-px flex gap-6 overflow-x-auto" role="toolbar" [attr.aria-label]="'catalog.filters' | transloco">
          <button type="button" class="filter-tab" [attr.aria-pressed]="!category()" (click)="category.set(null)">{{ 'catalog.all' | transloco }}</button>
          @for (c of categories; track c) {
            <button type="button" class="filter-tab" [attr.aria-pressed]="category() === c" (click)="category.set(c)">{{ 'category.' + c | transloco }}</button>
          }
        </div>
        <div class="flex items-center gap-4 pb-2">
          <label class="relative">
            <span class="sr-only">{{ 'catalog.brand' | transloco }}</span>
            <select class="min-h-10 appearance-none border-b border-line bg-transparent pr-6 text-[13px] focus:border-ink focus:outline-none" (change)="onBrand($event)">
              <option value="">{{ 'catalog.allBrands' | transloco }}</option>
              @for (b of brands(); track b.id) {<option [value]="b.id">{{ b.name }}</option>}
            </select>
            <ui-icon name="chevron-down" [size]="14" class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-muted" />
          </label>
          <label class="relative flex-1 md:flex-none">
            <span class="sr-only">{{ 'catalog.search' | transloco }}</span>
            <ui-icon name="search" [size]="16" class="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-muted" />
            <input type="search" class="min-h-10 w-full border-b border-line bg-transparent pl-6 text-[13px] placeholder:text-muted focus:border-ink focus:outline-none md:w-56"
              [placeholder]="'catalog.search' | transloco" (input)="onSearch($event)" />
          </label>
        </div>
      </div>

      <div class="flex items-center justify-between py-3 text-[12px] text-muted">
        @if (!loading() && !error()) {
          <p class="tabular" aria-live="polite">{{ 'catalog.count' | transloco: { n: visible().length } }}</p>
        }
        @if (selectedBody(); as body) {
          <p>
            {{ 'catalog.showingOn' | transloco }} <span class="text-ink">{{ 'body.tag.' + body.bodyTypeTag | transloco }}</span>
            · <span class="tabular">{{ body.heightRangeCm[0] }}–{{ body.heightRangeCm[1] }} cm</span>
          </p>
        }
      </div>

      @if (loading()) {
        <p class="sr-only" role="status">{{ 'common.loading' | transloco }}</p>
        <ul class="-mx-4 grid grid-cols-2 gap-px bg-line md:mx-0 md:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
          @for (i of placeholders; track i) {
            <li class="bg-paper pb-4"><ui-skeleton ratio="3 / 4" /><div class="mt-3 space-y-2 px-3"><ui-skeleton class="h-3 w-1/3" /><ui-skeleton class="h-3 w-2/3" /></div></li>
          }
        </ul>
      } @else if (error()) {
        <div class="border border-line p-8 text-center" role="alert">
          <p>{{ 'common.loadError' | transloco }}</p>
          <button type="button" class="btn mt-4" (click)="load()">{{ 'common.retry' | transloco }}</button>
        </div>
      } @else if (visible().length === 0) {
        <p class="border border-line p-8 text-center text-ink-2">{{ 'catalog.empty' | transloco }}</p>
      } @else {
        <ul class="-mx-4 grid grid-cols-2 gap-px bg-line md:mx-0 md:grid-cols-3 xl:grid-cols-4">
          @for (g of visible(); track g.id) {
            <li class="bg-paper">
              <a [routerLink]="['/prenda', g.id]" class="group block pb-5">
                <div class="aspect-[3/4] overflow-hidden bg-surface-2">
                  <img [src]="imageFor(g)" [alt]="g.name" loading="lazy" class="h-full w-full object-contain p-6 transition-transform duration-300 group-hover:scale-[1.03]" />
                </div>
                <div class="mt-3 space-y-0.5 px-3">
                  <p class="label-xs">{{ g.brandName }}</p>
                  <p class="text-[13px] leading-snug group-hover:underline">{{ g.name }}</p>
                  <p class="text-[13px] tabular">{{ g.priceCents | price }}</p>
                </div>
              </a>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .filter-tab {
      flex-shrink: 0;
      min-height: 44px;
      border-bottom: 2px solid transparent;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      white-space: nowrap;
    }
    .filter-tab:hover {
      color: var(--ink);
    }
    .filter-tab[aria-pressed='true'] {
      border-color: var(--ink);
      color: var(--ink);
    }
  `,
})
export class CatalogPage {
  private readonly api = inject(ApiService);
  private readonly store = inject(TryOnSessionStore);

  readonly placeholders = [1, 2, 3, 4, 5, 6, 7, 8];
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

  onBrand(ev: Event) {
    this.brandId.set((ev.target as HTMLSelectElement).value || null);
  }

  onSearch(ev: Event) {
    this.q.set((ev.target as HTMLInputElement).value);
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
