import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { GarmentItem } from '@vestirse/shared-types';
import { SoundService } from '../../core/sound';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { IconComponent } from '../../shared/ui/icon.component';
import { ProductCardComponent } from '../../shared/ui/product-card.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';

/**
 * Colección en carril horizontal: se arrastra o se desplaza con imán por tarjeta, la barra de abajo
 * muestra cuánto falta y "Reproducir" la hace avanzar sola (pausable, apagado con menos movimiento).
 */
@Component({
  selector: 'app-collection-rail',
  imports: [RouterLink, TranslocoPipe, IconComponent, ProductCardComponent, SkeletonComponent, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .rail {
      scroll-snap-type: x mandatory;
      scroll-padding-inline: 16px;
      overscroll-behavior-x: contain;
    }
    .rail > * {
      scroll-snap-align: start;
    }
    .progress {
      height: 2px;
      background: var(--line);
      border-radius: 2px;
      overflow: hidden;
    }
    .progress span {
      display: block;
      height: 100%;
      background: var(--ink);
      transform-origin: left;
      transition: transform 0.25s var(--ease-out);
    }
  `,
  template: `
    <section class="mt-20 md:mt-28" [attr.aria-labelledby]="headingId()">
      <div class="mx-auto flex max-w-screen-2xl items-end justify-between gap-6 px-4 md:px-8">
        <div appReveal>
          <p class="label-xs">{{ eyebrow() }}</p>
          <h2 [id]="headingId()" class="headline mt-3 text-[clamp(28px,4.2vw,64px)]">{{ title() }}</h2>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button type="button" class="nav-btn" (click)="toggle()" [attr.aria-pressed]="playing()">
            <ui-icon [name]="playing() ? 'pause' : 'play'" [size]="14" />
            <span class="mono hidden sm:inline">{{ (playing() ? 'home.pause' : 'home.play') | transloco }}</span>
          </button>
          <button type="button" class="nav-btn" (click)="step(-1)" [attr.aria-label]="'home.hero.prev' | transloco"><ui-icon name="chevron-left" [size]="16" /></button>
          <button type="button" class="nav-btn" (click)="step(1)" [attr.aria-label]="'home.hero.next' | transloco"><ui-icon name="chevron-right" [size]="16" /></button>
        </div>
      </div>

      <ul #rail class="rail no-scrollbar mt-8 flex gap-3 overflow-x-auto px-4 md:gap-4 md:px-8" (scroll)="onScroll()" tabindex="0" [attr.aria-label]="title()">
        @if (garments().length) {
          @for (g of garments(); track g.id; let i = $index) {
            <li class="w-[68vw] shrink-0 sm:w-[40vw] md:w-[28vw] xl:w-[21vw]" appReveal [revealDelay]="i < 6 ? i * 70 : 0">
              <ui-product-card [garment]="g" sizes="(min-width: 1280px) 21vw, (min-width: 768px) 28vw, 68vw" />
            </li>
          }
        } @else {
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <li class="w-[68vw] shrink-0 sm:w-[40vw] md:w-[28vw] xl:w-[21vw]" aria-hidden="true"><ui-skeleton ratio="3 / 4" class="rounded-[16px]" /></li>
          }
        }
      </ul>

      <div class="mx-auto mt-8 flex max-w-screen-2xl items-center gap-6 px-4 md:px-8">
        <div class="progress flex-1" aria-hidden="true"><span [style.transform]="'scaleX(' + progress() + ')'"></span></div>
        <a [routerLink]="link()" [queryParams]="query()" class="mono link-line inline-flex items-center gap-2">{{ 'home.shopAll' | transloco }}<ui-icon name="arrow-right" [size]="14" /></a>
      </div>
    </section>
  `,
  host: { class: 'block' },
})
export class CollectionRailComponent {
  readonly garments = input.required<GarmentItem[]>();
  readonly title = input.required<string>();
  readonly eyebrow = input('');
  readonly link = input('/tienda');
  readonly query = input<Record<string, string> | null>(null);
  readonly headingId = input('collection-title');

  private readonly rail = viewChild.required<ElementRef<HTMLElement>>('rail');
  private readonly sound = inject(SoundService);
  readonly progress = signal(0.08);
  readonly playing = signal(false);
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  onScroll() {
    const el = this.rail().nativeElement;
    const max = el.scrollWidth - el.clientWidth;
    this.progress.set(max <= 0 ? 1 : Math.max(0.08, (el.scrollLeft + el.clientWidth) / el.scrollWidth));
  }

  step(dir: number) {
    this.sound.play('tick');
    this.advance(dir);
  }

  private advance(dir: number) {
    const el = this.rail().nativeElement;
    const card = el.querySelector('li');
    const width = (card?.getBoundingClientRect().width ?? 300) + 16;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (dir > 0 && atEnd) el.scrollTo({ left: 0, behavior: 'smooth' });
    else el.scrollBy({ left: dir * width, behavior: 'smooth' });
  }

  toggle() {
    if (this.playing()) return this.stop();
    this.playing.set(true);
    this.timer = setInterval(() => this.advance(1), 2600);
  }

  private stop() {
    this.playing.set(false);
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
