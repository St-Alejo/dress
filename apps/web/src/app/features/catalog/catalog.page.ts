import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Brand, GarmentCategory, GarmentItem, SimilarBodyModel } from '@vestirse/shared-types';
import { ApiService } from '../../core/api.service';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import { PricePipe } from '../../shared/price.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { canWear } from '../live-overlay/engine/tryon-scene';
import { ApproxViewComponent } from './approx-view.component';
import { restingBody } from './garment-gallery.component';
import {
  COLOR_FAMILIES,
  type CatalogFilters,
  type ColorFamily,
  PRICE_BANDS,
  type PriceBand,
  type SortOrder,
  activeCount,
  filterGarments,
  filtersFromQuery,
  filtersToQuery,
  sizesIn,
} from './catalog-filters';

/** Muestra de cada familia para el botón de color. */
const SWATCH: Record<ColorFamily, string> = {
  neutral: 'linear-gradient(135deg, #f2f1ee 50%, #2b2b2b 50%)',
  earth: '#a67b5b',
  red: '#c92a2a',
  orange: '#e8590c',
  yellow: '#f2c94c',
  green: '#4f7a3a',
  blue: '#3b6fb6',
  purple: '#7048a8',
  pink: '#e8a0b4',
};

@Component({
  selector: 'app-catalog-page',
  imports: [RouterLink, TranslocoPipe, PricePipe, IconComponent, SkeletonComponent, ApproxViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-screen-2xl px-4 pt-8 pb-16 md:px-8">
      <header class="max-w-2xl">
        <h1 class="text-[28px] md:text-[40px]">{{ 'catalog.title' | transloco }}</h1>
        <p class="mt-3 max-w-xl text-[14px] text-ink-2">{{ 'catalog.lead' | transloco }}</p>
      </header>

      <div class="mt-8 flex flex-col gap-4 border-b border-line md:flex-row md:items-end md:justify-between">
        <div class="-mb-px flex gap-6 overflow-x-auto" role="toolbar" [attr.aria-label]="'catalog.filters' | transloco">
          <button type="button" class="filter-tab" [attr.aria-pressed]="!filters().category" (click)="set({ category: null })">{{ 'catalog.all' | transloco }}</button>
          @for (c of categories; track c) {
            <button type="button" class="filter-tab" [attr.aria-pressed]="filters().category === c" (click)="set({ category: c })">{{ 'category.' + c | transloco }}</button>
          }
        </div>
        <label class="relative pb-2 md:w-56">
          <span class="sr-only">{{ 'catalog.search' | transloco }}</span>
          <ui-icon name="search" [size]="16" class="pointer-events-none absolute left-0 top-[calc(50%-4px)] -translate-y-1/2 text-muted" />
          <input type="search" class="min-h-10 w-full border-b border-line bg-transparent pl-6 text-[13px] placeholder:text-muted focus:border-ink focus:outline-none"
            [value]="filters().q" [placeholder]="'catalog.search' | transloco" (input)="set({ q: value($event) })" />
        </label>
      </div>

      <div class="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line py-3">
        <fieldset class="flex items-center gap-1.5">
          <legend class="sr-only">{{ 'catalog.color' | transloco }}</legend>
          @for (c of colors; track c) {
            <button type="button" class="swatch" [style.background]="swatch[c]" [attr.aria-pressed]="filters().color === c"
              [attr.aria-label]="'catalog.colorFamily.' + c | transloco" [title]="'catalog.colorFamily.' + c | transloco"
              (click)="set({ color: filters().color === c ? null : c })"></button>
          }
        </fieldset>
        <label class="select">
          <span class="sr-only">{{ 'catalog.size' | transloco }}</span>
          <select [value]="filters().size ?? ''" (change)="set({ size: value($event) || null })">
            <option value="">{{ 'catalog.allSizes' | transloco }}</option>
            @for (s of sizes(); track s) {<option [value]="s">{{ s }}</option>}
          </select>
          <ui-icon name="chevron-down" [size]="14" />
        </label>
        <label class="select">
          <span class="sr-only">{{ 'catalog.price' | transloco }}</span>
          <select [value]="filters().price ?? ''" (change)="set({ price: band(value($event)) })">
            <option value="">{{ 'catalog.allPrices' | transloco }}</option>
            @for (p of priceBands; track p) {<option [value]="p">{{ 'catalog.priceBand.' + p | transloco }}</option>}
          </select>
          <ui-icon name="chevron-down" [size]="14" />
        </label>
        <label class="select">
          <span class="sr-only">{{ 'catalog.brand' | transloco }}</span>
          <select [value]="filters().brandId ?? ''" (change)="set({ brandId: value($event) || null })">
            <option value="">{{ 'catalog.allBrands' | transloco }}</option>
            @for (b of brands(); track b.id) {<option [value]="b.id">{{ b.name }}</option>}
          </select>
          <ui-icon name="chevron-down" [size]="14" />
        </label>
        <label class="select md:ml-auto">
          <span class="sr-only">{{ 'catalog.sort' | transloco }}</span>
          <select [value]="filters().sort" (change)="set({ sort: sortOf(value($event)) })">
            @for (s of sorts; track s) {<option [value]="s">{{ 'catalog.sortBy.' + s | transloco }}</option>}
          </select>
          <ui-icon name="chevron-down" [size]="14" />
        </label>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 py-3 text-[12px] text-muted">
        <div class="flex items-center gap-4">
          @if (!loading() && !error()) {
            <p class="tabular" aria-live="polite">{{ 'catalog.count' | transloco: { n: visible().length } }}</p>
          }
          @if (active() > 0) {
            <button type="button" class="min-h-8 text-ink underline underline-offset-4" (click)="clear()">{{ 'catalog.clear' | transloco: { n: active() } }}</button>
          }
        </div>
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
              <a [routerLink]="['/prenda', g.id]" class="group block pb-5" (pointerenter)="hover($event, g)" (pointerleave)="hovered.set(null)">
                <div class="relative aspect-[3/4] overflow-hidden bg-surface-2">
                  <img [src]="imageFor(g)" [attr.srcset]="srcsetFor(g)" [attr.sizes]="srcsetFor(g) ? cardSizes : null" [alt]="g.name" loading="lazy" decoding="async"
                    class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  @if (hovered() === g.id && hoverBody(); as body) {
                    <div class="absolute inset-0 bg-[#f6f5f2]">
                      <app-approx-view class="block h-full" [body]="body" [garments]="[g]" />
                      <span class="absolute bottom-2 left-2 bg-paper/90 px-2 py-0.5 text-[11px] text-ink">{{ 'catalog.onModel' | transloco }}</span>
                    </div>
                  }
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
    .swatch {
      width: 24px;
      height: 24px;
      border-radius: 9999px;
      border: 1px solid var(--line);
      outline-offset: 2px;
    }
    .swatch[aria-pressed='true'] {
      outline: 2px solid var(--ink);
    }
    .select {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .select select {
      min-height: 40px;
      appearance: none;
      border-bottom: 1px solid var(--line);
      background: transparent;
      padding-right: 20px;
      font-size: 13px;
    }
    .select select:focus {
      border-color: var(--ink);
      outline: none;
    }
    .select ui-icon {
      pointer-events: none;
      position: absolute;
      right: 0;
      color: var(--muted);
    }
  `,
})
export class CatalogPage {
  /** Filtros desde la URL (withComponentInputBinding), para poder compartir una búsqueda. */
  readonly q = input<string>();
  readonly cat = input<string>();
  readonly marca = input<string>();
  readonly color = input<string>();
  readonly talla = input<string>();
  readonly precio = input<string>();
  readonly orden = input<string>();

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly store = inject(TryOnSessionStore);

  readonly placeholders = [1, 2, 3, 4, 5, 6, 7, 8];
  readonly categories: GarmentCategory[] = ['top', 'bottom', 'dress', 'outerwear', 'footwear', 'accessory'];
  readonly colors = COLOR_FAMILIES;
  readonly swatch = SWATCH;
  readonly priceBands = Object.keys(PRICE_BANDS) as PriceBand[];
  readonly sorts: SortOrder[] = ['relevance', 'price-asc', 'price-desc', 'name'];
  readonly cardSizes = '(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw';
  readonly garments = signal<GarmentItem[]>([]);
  readonly brands = signal<Brand[]>([]);
  readonly bodies = signal<SimilarBodyModel[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly hovered = signal<string | null>(null);

  readonly filters = computed(() =>
    filtersFromQuery(
      { q: this.q(), cat: this.cat(), marca: this.marca(), color: this.color(), talla: this.talla(), precio: this.precio(), orden: this.orden() },
      this.categories,
    ),
  );
  readonly active = computed(() => activeCount(this.filters()));
  readonly sizes = computed(() => sizesIn(this.garments()));
  readonly visible = computed(() => filterGarments(this.garments(), this.filters()));
  readonly selectedBody = computed(() => this.bodies().find((b) => b.id === this.store.selectedBodyId()) ?? null);
  /** El modelo elegido o, si no tiene pose, el de brazos más sueltos. */
  readonly hoverBody = computed(() => {
    const chosen = this.selectedBody();
    return chosen?.pose ? chosen : restingBody(this.bodies());
  });

  constructor() {
    void this.load();
  }

  set(patch: Partial<CatalogFilters>) {
    void this.router.navigate([], { queryParams: filtersToQuery({ ...this.filters(), ...patch }), replaceUrl: true });
  }

  clear() {
    this.set({ q: '', category: null, brandId: null, color: null, size: null, price: null });
  }

  band(v: string): PriceBand | null {
    return this.priceBands.find((p) => p === v) ?? null;
  }

  sortOf(v: string): SortOrder {
    return this.sorts.find((s) => s === v) ?? 'relevance';
  }

  value(ev: Event): string {
    return (ev.target as HTMLInputElement | HTMLSelectElement).value;
  }

  /** Al pasar el ratón, la prenda aparece puesta en el modelo; en táctil no, para no estorbar el toque. */
  hover(ev: PointerEvent, g: GarmentItem) {
    if (ev.pointerType === 'mouse' && canWear(g)) this.hovered.set(g.id);
  }

  /** Foto real de producto; si la persona eligió un modelo y ya hay una prueba sobre él, se muestra esa. */
  imageFor(g: GarmentItem) {
    return this.selectedBody()?.previewImages[g.id] ?? g.images.thumb ?? g.images.photo;
  }

  srcsetFor(g: GarmentItem): string | null {
    if (this.selectedBody()?.previewImages[g.id] || !g.images.thumb) return null;
    return `${g.images.thumb} 384w, ${g.images.photo} 768w`;
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
