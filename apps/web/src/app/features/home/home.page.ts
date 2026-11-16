import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { GarmentCategory, GarmentItem } from '@vestirse/shared-types';
import { ApiService } from '../../core/api.service';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { IconComponent } from '../../shared/ui/icon.component';
import { CollectionRailComponent } from './collection-rail.component';
import { FeaturedCarouselComponent } from './featured-carousel.component';
import { HeroCampaignComponent } from './hero-campaign.component';

interface Tile {
  key: GarmentCategory;
  image: string;
}

const CATEGORY_TILES: Tile[] = [
  { key: 'top', image: 'campaign/cat-top.webp' },
  { key: 'outerwear', image: 'campaign/cat-outerwear.webp' },
  { key: 'bottom', image: 'campaign/cat-bottom.webp' },
  { key: 'dress', image: 'campaign/cat-dress.webp' },
];

const MODES = [
  { key: 'camera', image: 'campaign/probador.webp', link: '/tienda' },
  { key: 'photo', image: 'campaign/hero-2-sm.webp', link: '/tienda' },
  { key: 'look', image: 'campaign/look.webp', link: '/look' },
] as const;

/**
 * Portada editorial: campaña, colección en carril, categorías en retícula con mira de cámara,
 * manifiesto, destacado en profundidad, las tres formas de probarse y una prueba real con IA.
 * Las fotos de campaña se generaron con IA; las de producto son reales.
 */
@Component({
  selector: 'app-home-page',
  imports: [RouterLink, TranslocoPipe, IconComponent, RevealDirective, HeroCampaignComponent, CollectionRailComponent, FeaturedCarouselComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .cat-label {
      font-family: var(--font-display);
      font-stretch: 115%;
      font-weight: 700;
      font-size: clamp(18px, 2.4vw, 34px);
      letter-spacing: -0.02em;
      text-transform: uppercase;
      color: #fff;
      text-shadow: 0 1px 24px rgb(0 0 0 / 0.25);
    }
    .reticle {
      width: clamp(64px, 9vw, 120px);
      aspect-ratio: 1;
      border: 2px solid var(--paper);
      border-radius: 9999px;
    }
    .reticle::before,
    .reticle::after {
      content: '';
      position: absolute;
      background: var(--paper);
    }
    .reticle::before {
      left: 50%;
      top: -40%;
      bottom: -40%;
      width: 2px;
      margin-left: -1px;
    }
    .reticle::after {
      top: 50%;
      left: -40%;
      right: -40%;
      height: 2px;
      margin-top: -1px;
    }
    .modes {
      height: clamp(380px, 46vw, 620px);
    }
    .mode {
      flex: 1 1 0;
      transition: flex-grow 0.9s var(--ease-film);
    }
    @media (hover: hover) and (min-width: 768px) {
      .modes:hover .mode {
        flex-grow: 0.7;
      }
      .modes .mode:hover {
        flex-grow: 2.2;
      }
    }
    .mode-title {
      font-family: var(--font-display);
      font-stretch: 120%;
      font-weight: 800;
      font-size: clamp(30px, 4.6vw, 76px);
      line-height: 0.9;
      letter-spacing: -0.035em;
      text-transform: uppercase;
      color: #fff;
    }
    .inline-shot {
      display: inline-block;
      width: 1.6em;
      height: 0.78em;
      margin: 0 0.08em;
      vertical-align: -0.04em;
      border-radius: 0.14em;
      background-size: cover;
      background-position: center;
    }
  `,
  template: `
    <app-hero-campaign />

    <app-collection-rail [garments]="collection()" [title]="'home.collection.title' | transloco" [eyebrow]="'home.collection.eyebrow' | transloco" headingId="collection-title" />

    <!-- Categorías: retícula de cuatro con mira en el centro -->
    <section class="mx-auto mt-24 max-w-screen-2xl px-3 md:mt-32 md:px-4" aria-labelledby="categories-title">
      <div class="flex items-end justify-between gap-6 px-1 md:px-4">
        <div appReveal>
          <p class="label-xs">{{ 'home.categories.eyebrow' | transloco }}</p>
          <h2 id="categories-title" class="headline mt-3 text-[clamp(28px,4.2vw,64px)]">{{ 'home.categories.title' | transloco }}</h2>
        </div>
        <a routerLink="/tienda" class="mono link-line hidden items-center gap-2 sm:inline-flex">{{ 'home.shopAll' | transloco }}<ui-icon name="arrow-right" [size]="14" /></a>
      </div>
      <div class="relative mt-8 grid grid-cols-2 gap-1.5 md:gap-2">
        @for (t of tiles; track t.key; let i = $index) {
          <a [routerLink]="'/tienda'" [queryParams]="{ cat: t.key }" class="group shot block aspect-[3/4] md:aspect-[4/3]" appReveal="clip" [revealDelay]="i * 90"
            [attr.data-cursor]="'home.cursor.shop' | transloco">
            <img [src]="t.image" alt="" loading="lazy" decoding="async" class="zoomable absolute inset-0 h-full w-full object-cover object-[50%_25%]" />
            <span class="absolute inset-0 grid place-items-center"><span class="cat-label">{{ 'category.' + t.key | transloco }}</span></span>
          </a>
        }
        <span class="reticle pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden="true"></span>
      </div>
    </section>

    <!-- Manifiesto con fotos dentro del texto -->
    <section class="mx-auto mt-28 max-w-screen-2xl px-4 md:mt-40 md:px-8" aria-labelledby="manifesto-title">
      <p class="label-xs" appReveal>{{ 'home.manifesto.eyebrow' | transloco }}</p>
      <h2 id="manifesto-title" class="display mt-6 text-[clamp(38px,7.4vw,124px)]" appReveal [revealDelay]="80">
        {{ 'home.manifesto.a' | transloco }}
        <span class="inline-shot" style="background-image: url(campaign/textura.webp)" aria-hidden="true"></span>
        {{ 'home.manifesto.b' | transloco }}
        <span class="inline-shot" style="background-image: url(campaign/hero-3-sm.webp)" aria-hidden="true"></span>
        {{ 'home.manifesto.c' | transloco }}
      </h2>
      <div class="mt-10 grid gap-6 md:grid-cols-3" appReveal [revealDelay]="160">
        @for (p of ['one', 'two', 'three']; track p; let i = $index) {
          <div class="border-t border-ink pt-4">
            <p class="mono text-muted tabular">0{{ i + 1 }}</p>
            <p class="mono mt-2 text-ink">{{ 'home.manifesto.point.' + p + '.title' | transloco }}</p>
            <p class="mt-2 text-[14px] text-ink-2">{{ 'home.manifesto.point.' + p + '.text' | transloco }}</p>
          </div>
        }
      </div>
    </section>

    <app-featured-carousel [garments]="featured()" />

    <!-- Tres formas de probarte: paneles que se expanden -->
    <section class="mx-auto mt-24 max-w-screen-2xl px-3 md:mt-32 md:px-4" aria-labelledby="modes-title">
      <div class="px-1 md:px-4" appReveal>
        <p class="label-xs">{{ 'home.modes.eyebrow' | transloco }}</p>
        <h2 id="modes-title" class="headline mt-3 text-[clamp(28px,4.2vw,64px)]">{{ 'home.modes.title' | transloco }}</h2>
      </div>
      <div class="modes mt-8 flex flex-col gap-1.5 md:flex-row md:gap-2">
        @for (m of modes; track m.key; let i = $index) {
          <a [routerLink]="m.link" class="mode shot group block min-h-[200px]" appReveal="clip" [revealDelay]="i * 110" [attr.data-cursor]="'home.cursor.try' | transloco">
            <img [src]="m.image" alt="" loading="lazy" decoding="async" class="zoomable absolute inset-0 h-full w-full object-cover" />
            <span class="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent"></span>
            <span class="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5 md:p-7">
              <span class="mono text-white/70 tabular">0{{ i + 1 }}</span>
              <span class="mode-title">{{ 'home.modes.' + m.key + '.title' | transloco }}</span>
              <span class="mono max-w-xs text-white/85">{{ 'home.modes.' + m.key + '.text' | transloco }}</span>
            </span>
          </a>
        }
      </div>
    </section>

    <!-- Prueba real con IA: antes y después -->
    <section class="mx-auto mt-24 grid max-w-screen-2xl gap-10 px-4 md:mt-32 md:grid-cols-[1fr_1.4fr] md:items-center md:px-8" aria-labelledby="ai-title">
      <div appReveal>
        <p class="label-xs">{{ 'home.ai.eyebrow' | transloco }}</p>
        <h2 id="ai-title" class="headline mt-3 text-[clamp(28px,4.2vw,64px)]">{{ 'home.ai.title' | transloco }}</h2>
        <p class="mt-5 max-w-md text-[15px] text-ink-2">{{ 'home.ai.text' | transloco }}</p>
        <div class="mt-6 flex flex-wrap gap-2" role="group" [attr.aria-label]="'home.ai.pick' | transloco">
          @for (d of demos; track d.after; let i = $index) {
            <button type="button" class="chip" [attr.aria-pressed]="demo() === i" (click)="demo.set(i)">{{ 'home.ai.demo.' + d.key | transloco }}</button>
          }
        </div>
        <a routerLink="/carrito" class="btn btn-primary mt-8">{{ 'home.ai.cta' | transloco }}<ui-icon name="arrow-right" [size]="16" /></a>
        <p class="mono mt-4 max-w-sm text-muted">{{ 'favorites.disclaimer' | transloco }}</p>
      </div>
      <div class="grid grid-cols-2 gap-1.5 md:gap-2">
        @for (side of ['before', 'after']; track side; let i = $index) {
          <figure class="shot aspect-[2/3]" appReveal="clip" [revealDelay]="i * 140">
            @for (d of demos; track d.after; let j = $index) {
              <img [src]="side === 'before' ? d.before : d.after" [alt]="('home.ai.' + side | transloco) + ' · ' + ('home.ai.demo.' + d.key | transloco)"
                loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover transition-opacity duration-700" [class.opacity-0]="demo() !== j" />
            }
            <figcaption class="mono absolute left-3 top-3 rounded-full bg-paper/90 px-2.5 py-1 text-ink">{{ 'home.ai.' + side | transloco }}</figcaption>
            @if (side === 'after') {
              <span class="absolute bottom-3 right-3 grid size-10 place-items-center rounded-full bg-ink text-paper" aria-hidden="true"><ui-icon name="crosshair" [size]="18" /></span>
            }
          </figure>
        }
      </div>
    </section>

    <!-- Tienda: bloque a sangre con texto gigante -->
    <section class="mx-3 mt-24 md:mx-4 md:mt-32">
      <a routerLink="/tienda" class="shot group block h-[clamp(320px,52vw,680px)]" appReveal="clip" [attr.data-cursor]="'home.cursor.shop' | transloco">
        <img src="campaign/tienda.webp" alt="" loading="lazy" decoding="async" class="zoomable absolute inset-0 h-full w-full object-cover" />
        <span class="absolute inset-0 bg-black/25"></span>
        <span class="absolute inset-0 flex flex-col items-center justify-center gap-5 px-4 text-center text-white">
          <span class="mono opacity-80">{{ 'home.store.eyebrow' | transloco: { n: count() } }}</span>
          <span class="display text-[clamp(48px,11vw,190px)]">{{ 'home.store.title' | transloco }}</span>
          <span class="btn btn-light">{{ 'home.hero.cta' | transloco }}<ui-icon name="arrow-up-right" [size]="16" /></span>
        </span>
      </a>
    </section>
  `,
})
export class HomePage {
  private readonly api = inject(ApiService);

  readonly tiles = CATEGORY_TILES;
  readonly modes = MODES;
  readonly demos = [
    { key: 'him', before: 'campaign/antes-b05.webp', after: 'campaign/despues-el-cena.webp' },
    { key: 'her', before: 'campaign/antes-b02.webp', after: 'campaign/despues-ella-vestido-rojo.webp' },
  ];
  readonly demo = signal(0);
  readonly garments = signal<GarmentItem[]>([]);
  readonly count = computed(() => this.garments().length);

  /** Colección: prendas con foto, intercalando categorías para que el carril no sea monótono. */
  readonly collection = computed(() => interleave(this.garments()).slice(0, 14));
  /** Destacado: prendas que se ven mejor grandes (abrigos, vestidos, camisas con modelo). */
  readonly featured = computed(() => {
    const pick = this.garments().filter((g) => ['outerwear', 'dress', 'top'].includes(g.category) && g.photoType === 'model');
    return (pick.length >= 5 ? pick : this.garments()).slice(0, 8);
  });

  constructor() {
    void this.api
      .garments()
      .then((g) => this.garments.set(g))
      .catch(() => undefined);
  }
}

/** Reparte las prendas por categoría en turnos (arriba, abajo, vestido...). */
export function interleave(items: GarmentItem[]): GarmentItem[] {
  const groups = new Map<string, GarmentItem[]>();
  for (const g of items) groups.set(g.category, [...(groups.get(g.category) ?? []), g]);
  const queues = [...groups.values()];
  const out: GarmentItem[] = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift()!);
  return out;
}
