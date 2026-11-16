import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Brand, GarmentCategory, GarmentItem, SimilarBodyModel } from '@vestirse/shared-types';
import { ApiService } from '../../core/api.service';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProductCardComponent } from '../../shared/ui/product-card.component';
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

/** Fotos de campaña que se intercalan en la retícula (solo sin filtros), como en una revista. */
interface Story {
  id: string;
  image: string;
  focus: string;
  link: string;
  query: Record<string, string> | null;
}
const STORIES: Story[] = [
  { id: 'layers', image: 'campaign/hero-3-sm.webp', focus: 'center 35%', link: '/tienda', query: { cat: 'outerwear' } },
  { id: 'look', image: 'campaign/look.webp', focus: 'center 30%', link: '/look', query: null },
  { id: 'texture', image: 'campaign/textura.webp', focus: 'center', link: '/tienda', query: { cat: 'top' } },
];
/** Tras cuántas prendas va cada foto de campaña. */
const STORY_EVERY = 7;

interface Cell {
  key: string;
  garment?: GarmentItem;
  story?: Story;
}

/** Prendas con fotos de campaña intercaladas cada `STORY_EVERY` (nunca al final de la lista). */
export function interleaveStories(list: GarmentItem[], withStories: boolean): Cell[] {
  const out: Cell[] = [];
  list.forEach((g, i) => {
    out.push({ key: g.id, garment: g });
    const n = (i + 1) / STORY_EVERY;
    if (withStories && Number.isInteger(n) && n <= STORIES.length && i < list.length - 1) {
      const story = STORIES[n - 1];
      out.push({ key: 'story-' + story.id, story });
    }
  });
  return out;
}

@Component({
  selector: 'app-catalog-page',
  imports: [RouterLink, TranslocoPipe, IconComponent, SkeletonComponent, ApproxViewComponent, ProductCardComponent, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-screen-2xl px-3 pt-6 pb-20 md:px-4">
      <header class="grid gap-6 px-1 md:grid-cols-[1fr_minmax(0,28rem)] md:items-end">
        <h1 class="display text-[clamp(64px,15vw,240px)]" appReveal>
          {{ 'catalog.heading' | transloco }}<sup class="mono ml-2 align-top text-[13px] tracking-normal tabular">({{ garments().length }})</sup>
        </h1>
        <div class="pb-2" appReveal [revealDelay]="120">
          <p class="headline text-[18px] md:text-[22px]">{{ 'catalog.title' | transloco }}</p>
          <p class="mt-3 max-w-md text-[13px] leading-relaxed text-ink-2">{{ 'catalog.lead' | transloco }}</p>
        </div>
      </header>

      <div class="contents">
        <div class="sticky top-[56px] z-20 -mx-3 mt-8 flex flex-col gap-3 bg-paper/85 px-3 py-3 backdrop-blur-md md:-mx-4 md:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="toolbar" [attr.aria-label]="'catalog.filters' | transloco">
            <button type="button" class="pill" [attr.aria-pressed]="!filters().category" (click)="set({ category: null })">{{ 'catalog.all' | transloco }}</button>
            @for (c of categories; track c) {
              <button type="button" class="pill" [attr.aria-pressed]="filters().category === c" (click)="set({ category: c })">{{ 'category.' + c | transloco }}</button>
            }
          </div>
          <label class="relative lg:w-72">
            <span class="sr-only">{{ 'catalog.search' | transloco }}</span>
            <ui-icon name="search" [size]="15" class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input type="search" class="mono h-10 w-full rounded-full border border-line bg-transparent pl-10 pr-4 placeholder:text-muted focus:border-ink focus:outline-none"
              [value]="filters().q" [placeholder]="'catalog.search' | transloco" (input)="set({ q: value($event) })" />
          </label>
        </div>

        <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
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
            <ui-icon name="chevron-down" [size]="13" />
          </label>
          <label class="select">
            <span class="sr-only">{{ 'catalog.price' | transloco }}</span>
            <select [value]="filters().price ?? ''" (change)="set({ price: band(value($event)) })">
              <option value="">{{ 'catalog.allPrices' | transloco }}</option>
              @for (p of priceBands; track p) {<option [value]="p">{{ 'catalog.priceBand.' + p | transloco }}</option>}
            </select>
            <ui-icon name="chevron-down" [size]="13" />
          </label>
          <label class="select">
            <span class="sr-only">{{ 'catalog.brand' | transloco }}</span>
            <select [value]="filters().brandId ?? ''" (change)="set({ brandId: value($event) || null })">
              <option value="">{{ 'catalog.allBrands' | transloco }}</option>
              @for (b of brands(); track b.id) {<option [value]="b.id">{{ b.name }}</option>}
            </select>
            <ui-icon name="chevron-down" [size]="13" />
          </label>
          <label class="select md:ml-auto">
            <span class="sr-only">{{ 'catalog.sort' | transloco }}</span>
            <select [value]="filters().sort" (change)="set({ sort: sortOf(value($event)) })">
              @for (s of sorts; track s) {<option [value]="s">{{ 'catalog.sortBy.' + s | transloco }}</option>}
            </select>
            <ui-icon name="chevron-down" [size]="13" />
          </label>
        </div>
      </div>

      <div class="mono flex flex-wrap items-center justify-between gap-2 px-1 py-4 text-muted">
        <div class="flex items-center gap-4">
          @if (!loading() && !error()) {
            <p class="tabular" aria-live="polite">{{ 'catalog.count' | transloco: { n: visible().length } }}</p>
          }
          @if (active() > 0) {
            <button type="button" class="link-line min-h-8 text-ink" (click)="clear()">{{ 'catalog.clear' | transloco: { n: active() } }}</button>
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
        <ul class="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
          @for (i of placeholders; track i) {
            <li><ui-skeleton ratio="3 / 4" class="block overflow-hidden rounded-[16px]" /><div class="mt-3 space-y-2"><ui-skeleton class="h-3 w-2/3" /><ui-skeleton class="h-3 w-1/3" /></div></li>
          }
        </ul>
      } @else if (error()) {
        <div class="card p-8 text-center" role="alert">
          <p>{{ 'common.loadError' | transloco }}</p>
          <button type="button" class="btn mt-4" (click)="load()">{{ 'common.retry' | transloco }}</button>
        </div>
      } @else if (visible().length === 0) {
        <div class="card p-10 text-center">
          <p class="headline text-[22px]">{{ 'catalog.empty' | transloco }}</p>
          <button type="button" class="btn btn-ghost mt-5" (click)="clear()">{{ 'catalog.clear' | transloco: { n: active() } }}</button>
        </div>
      } @else {
        <ul class="grid grid-flow-dense grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
          @for (cell of cells(); track cell.key; let i = $index) {
            @if (cell.garment; as g) {
              <li appReveal [revealDelay]="(i % 4) * 70" (pointerenter)="hover($event, g)" (pointerleave)="hovered.set(null)">
                <ui-product-card [garment]="g" [image]="previewFor(g)" [sizes]="cardSizes">
                  @if (hovered() === g.id && hoverBody(); as body) {
                    <div class="absolute inset-0 bg-[#f6f5f2]">
                      <app-approx-view class="block h-full" [body]="body" [garments]="[g]" />
                      <span class="mono absolute bottom-2.5 left-2.5 rounded-full bg-white/90 px-2.5 py-1 text-black">{{ 'catalog.onModel' | transloco }}</span>
                    </div>
                  }
                </ui-product-card>
              </li>
            } @else if (cell.story; as st) {
              <li class="col-span-2" appReveal>
                <a [routerLink]="st.link" [queryParams]="st.query" class="group shot block h-full min-h-[300px]" [attr.data-cursor]="'home.cursor.shop' | transloco">
                  <img [src]="st.image" alt="" loading="lazy" decoding="async" class="zoomable absolute inset-0 h-full w-full object-cover" [style.object-position]="st.focus" />
                  <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent"></div>
                  <div class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-white md:p-6">
                    <div>
                      <p class="mono opacity-80">{{ 'catalog.story.' + st.id + '.eyebrow' | transloco }}</p>
                      <p class="display mt-2 text-[clamp(30px,4.4vw,64px)]">{{ 'catalog.story.' + st.id + '.title' | transloco }}</p>
                    </div>
                    <span class="grid size-11 shrink-0 place-items-center rounded-full bg-white text-black transition-transform duration-500 group-hover:rotate-45">
                      <ui-icon name="arrow-up-right" [size]="16" />
                    </span>
                  </div>
                </a>
              </li>
            }
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .pill {
      flex-shrink: 0;
      height: 36px;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: 9999px;
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      white-space: nowrap;
      transition:
        background-color 0.3s var(--ease-out),
        color 0.3s var(--ease-out),
        border-color 0.3s var(--ease-out);
    }
    .pill:hover {
      border-color: var(--ink);
    }
    .pill[aria-pressed='true'] {
      background: var(--ink);
      border-color: var(--ink);
      color: var(--paper);
    }
    .swatch {
      width: 22px;
      height: 22px;
      border-radius: 9999px;
      border: 1px solid var(--line);
      outline-offset: 2px;
      transition: transform 0.3s var(--ease-out);
    }
    .swatch:hover {
      transform: scale(1.12);
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
      height: 36px;
      appearance: none;
      border: 1px solid var(--line);
      border-radius: 9999px;
      background: transparent;
      padding: 0 30px 0 14px;
      font-family: var(--font-mono);
      font-size: 11px;
      text-transform: uppercase;
    }
    .select select:focus {
      border-color: var(--ink);
      outline: none;
    }
    .select ui-icon {
      pointer-events: none;
      position: absolute;
      right: 11px;
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
  /** Con filtros u otro orden se muestran solo prendas: la campaña acompaña a la vista general. */
  readonly cells = computed(() => interleaveStories(this.visible(), this.active() === 0 && this.filters().sort === 'relevance'));
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

  /** Si la persona eligió un modelo y ya hay una prueba sobre él, se muestra esa en lugar de la foto. */
  previewFor(g: GarmentItem): string | null {
    return this.selectedBody()?.previewImages[g.id] ?? null;
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
