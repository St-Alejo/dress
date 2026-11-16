import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { GarmentItem } from '@vestirse/shared-types';
import { CartStore } from '../../core/cart.store';
import { NoticeStore } from '../../core/notice.store';
import { SoundService } from '../../core/sound';
import { PricePipe } from '../../shared/price.pipe';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { IconComponent } from '../../shared/ui/icon.component';

/**
 * "Destacado": carrusel en profundidad sobre fondo oscuro. La prenda del centro se ve grande y las
 * vecinas se alejan; debajo, su ficha con tallas y "Añadir a la bolsa" sin salir de la portada.
 * Se maneja con flechas, con las teclas ← → o tocando una prenda lateral.
 */
@Component({
  selector: 'app-featured-carousel',
  imports: [RouterLink, TranslocoPipe, PricePipe, IconComponent, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .stage {
      perspective: 1400px;
      height: clamp(360px, 52vw, 560px);
    }
    .fcard {
      position: absolute;
      left: 50%;
      top: 0;
      width: clamp(200px, 30vw, 380px);
      height: 100%;
      margin-left: calc(clamp(200px, 30vw, 380px) / -2);
      border-radius: var(--radius-card);
      overflow: hidden;
      background: var(--stage);
      transition:
        transform 0.9s var(--ease-film),
        opacity 0.9s var(--ease-film),
        filter 0.9s var(--ease-film);
      will-change: transform;
    }
    .fcard img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .glow {
      background: radial-gradient(60% 55% at 50% 40%, rgb(255 255 255 / 0.12), transparent 70%);
    }
    .info {
      animation: fade-up 0.7s var(--ease-out) both;
    }
    .size {
      min-width: 40px;
      height: 34px;
      padding: 0 10px;
      border: 1px solid rgb(255 255 255 / 0.25);
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 11px;
    }
    .size[aria-pressed='true'] {
      background: #fff;
      color: #000;
      border-color: #fff;
    }
  `,
  template: `
    <section class="relative mx-3 mt-24 overflow-hidden rounded-[24px] bg-night text-night-ink md:mx-4 md:mt-32" [attr.aria-labelledby]="'featured-title'"
      (keydown.arrowLeft)="go(-1)" (keydown.arrowRight)="go(1)">
      <div class="glow pointer-events-none absolute inset-0"></div>
      <div class="relative px-4 pt-12 text-center md:pt-16">
        <p class="mono text-night-ink/50">{{ 'home.featured.eyebrow' | transloco }}</p>
        <h2 id="featured-title" class="display mt-3 text-[clamp(44px,9vw,140px)]" appReveal>{{ 'home.featured.title' | transloco }}</h2>
      </div>

      @if (garments().length) {
        <div class="stage relative mt-10" role="group" aria-roledescription="carousel" [attr.aria-label]="'home.featured.title' | transloco">
          @for (g of garments(); track g.id; let i = $index) {
            @let o = offset(i);
            @if (o >= -2 && o <= 2) {
              <button type="button" class="fcard" [style.transform]="transform(o)" [style.opacity]="o === 0 ? 1 : abs(o) === 1 ? 0.55 : 0.18"
                [style.filter]="o === 0 ? 'none' : 'grayscale(0.4) brightness(0.8)'" [style.z-index]="10 - abs(o)"
                [attr.aria-hidden]="o !== 0" [tabindex]="o === 0 ? 0 : -1" (click)="o === 0 ? null : go(o)"
                [attr.data-cursor]="(o === 0 ? 'home.cursor.view' : o < 0 ? 'home.cursor.prev' : 'home.cursor.next') | transloco"
                [attr.aria-label]="g.name">
                <img [src]="g.images.photo" [alt]="o === 0 ? g.name : ''" loading="lazy" decoding="async" />
              </button>
            }
          }
          <button type="button" class="absolute left-3 top-1/2 z-20 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/25 hover:bg-white hover:text-black md:left-8"
            (click)="go(-1)" [attr.aria-label]="'home.hero.prev' | transloco"><ui-icon name="chevron-left" [size]="18" /></button>
          <button type="button" class="absolute right-3 top-1/2 z-20 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/25 hover:bg-white hover:text-black md:right-8"
            (click)="go(1)" [attr.aria-label]="'home.hero.next' | transloco"><ui-icon name="chevron-right" [size]="18" /></button>
        </div>

        @if (current(); as g) {
          <div class="info mx-auto max-w-md px-4 pb-14 pt-8 text-center" aria-live="polite">
            <p class="mono text-night-ink/50 tabular">{{ pad(index() + 1) }} / {{ pad(garments().length) }}</p>
            <h3 class="mono mt-3 text-[13px] text-night-ink">{{ g.name }}</h3>
            <p class="mono mt-1 text-night-ink/70 tabular">{{ g.priceCents | price }}</p>
            @if (g.fabricNotes) {<p class="mono mx-auto mt-4 max-w-sm text-night-ink/60">{{ g.fabricNotes | transloco }}</p>}
            @if (g.sizeChart.length) {
              <div class="mt-6 flex flex-wrap justify-center gap-1.5" role="group" [attr.aria-label]="'catalog.size' | transloco">
                @for (s of g.sizeChart; track s.size) {
                  <button type="button" class="size" [attr.aria-pressed]="size() === s.size" (click)="size.set(s.size)">{{ s.size }}</button>
                }
              </div>
            }
            <div class="mt-5 flex flex-col items-center gap-3">
              <button type="button" class="btn btn-light w-full max-w-xs" (click)="add(g)">{{ 'cart.add' | transloco }}@if (size(); as s) {<span> · {{ s }}</span>}</button>
              <a [routerLink]="['/prenda', g.id]" class="mono link-line">{{ 'home.featured.details' | transloco }}</a>
            </div>
          </div>
        }
      } @else {
        <div class="stage mt-10" aria-hidden="true"></div>
      }
    </section>
  `,
})
export class FeaturedCarouselComponent {
  readonly garments = input.required<GarmentItem[]>();
  readonly index = signal(0);
  readonly size = signal<string | null>(null);
  readonly current = computed(() => this.garments()[this.index()] ?? null);
  private readonly cart = inject(CartStore);
  private readonly notices = inject(NoticeStore);
  private readonly sound = inject(SoundService);

  /** Distancia circular de la prenda i al centro (-n/2..n/2). */
  offset(i: number): number {
    const n = this.garments().length;
    let o = (i - this.index() + n) % n;
    if (o > n / 2) o -= n;
    return o;
  }

  abs(n: number) {
    return Math.abs(n);
  }

  transform(o: number): string {
    const x = o * 74;
    const scale = 1 - Math.min(Math.abs(o), 2) * 0.2;
    return `translateX(${x}%) translateZ(${-Math.abs(o) * 120}px) rotateY(${-o * 14}deg) scale(${scale})`;
  }

  go(step: number) {
    const n = this.garments().length;
    if (!n) return;
    this.sound.play('tick');
    this.size.set(null);
    this.index.update((i) => (i + step + n) % n);
  }

  pad(n: number) {
    return String(n).padStart(2, '0');
  }

  add(g: GarmentItem) {
    this.sound.play('shutter');
    if (this.cart.add(g.id, this.size())) this.notices.success('cart.added');
  }
}
