import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SoundService } from '../../core/sound';
import { IconComponent } from '../../shared/ui/icon.component';

interface Slide {
  image: string;
  small: string;
  key: string;
  focus: string;
}

const SLIDES: Slide[] = [
  { image: 'campaign/hero-1.webp', small: 'campaign/hero-1-sm.webp', key: 'motion', focus: '50% 40%' },
  { image: 'campaign/hero-2.webp', small: 'campaign/hero-2-sm.webp', key: 'tailoring', focus: '50% 30%' },
  { image: 'campaign/hero-3.webp', small: 'campaign/hero-3-sm.webp', key: 'stride', focus: '55% 35%' },
];
const DURATION = 6500;

/**
 * Campaña de portada: fotos a sangre que se suceden con un zoom lento, una cinta de texto gigante
 * que cruza la imagen y barras de progreso por diapositiva. Se puede pausar (WCAG 2.2.2) y se para
 * sola con "reducir movimiento".
 */
@Component({
  selector: 'app-hero-campaign',
  imports: [RouterLink, TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .frame {
      height: calc(100svh - 56px - 24px);
      min-height: 520px;
      max-height: 980px;
      color: #fff;
    }
    .slide {
      position: absolute;
      inset: 0;
      opacity: 0;
      transition: opacity 1.2s var(--ease-out);
    }
    .slide.on {
      opacity: 1;
    }
    .slide img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scale(1.12);
      transition: transform 7.5s linear;
    }
    .slide.on img {
      transform: scale(1);
    }
    .shade {
      background:
        linear-gradient(to top, rgb(0 0 0 / 0.42), transparent 38%),
        linear-gradient(to bottom, rgb(0 0 0 / 0.18), transparent 22%);
    }
    .tape {
      font-family: var(--font-mono);
      font-weight: 300;
      font-size: clamp(44px, 8.6vw, 148px);
      letter-spacing: -0.04em;
      line-height: 1;
      text-transform: uppercase;
      mix-blend-mode: difference;
      white-space: nowrap;
    }
    .bar {
      height: 2px;
      flex: 1;
      background: rgb(255 255 255 / 0.3);
      border-radius: 2px;
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      background: #fff;
      transform-origin: left;
      transform: scaleX(0);
    }
    .bar.done span {
      transform: scaleX(1);
    }
    .bar.on span {
      animation: fill var(--dur) linear forwards;
    }
    .paused .bar.on span {
      animation-play-state: paused;
    }
    @keyframes fill {
      to {
        transform: scaleX(1);
      }
    }
    .caption {
      animation: fade-up 0.9s var(--ease-out) both;
    }
  `,
  template: `
    <section class="px-3 pt-3 md:px-4" [attr.aria-label]="'home.hero.label' | transloco" aria-roledescription="carousel">
      <div class="frame shot relative" [class.paused]="paused()" [style.--dur]="duration + 'ms'" [attr.data-cursor]="'home.cursor.shop' | transloco">
        @for (s of slides; track s.image; let i = $index) {
          <div class="slide" [class.on]="i === index()" [attr.aria-hidden]="i !== index()" role="group" aria-roledescription="slide"
            [attr.aria-label]="(i + 1) + ' / ' + slides.length">
            <img [src]="s.image" [attr.srcset]="s.small + ' 1100w, ' + s.image + ' 2048w'" sizes="100vw" [style.object-position]="s.focus"
              [alt]="'home.hero.alt.' + s.key | transloco" [attr.fetchpriority]="i === 0 ? 'high' : null" [attr.loading]="i === 0 ? 'eager' : 'lazy'" decoding="async" />
          </div>
        }
        <div class="shade pointer-events-none absolute inset-0"></div>

        <!-- Cinta de texto que cruza la foto -->
        <div class="pointer-events-none absolute inset-x-0 top-[38%] overflow-hidden" aria-hidden="true">
          <div class="marquee tape" [class.paused]="paused()" style="--marquee-speed: 46s">
            @for (n of [0, 1]; track n) {
              <span class="pr-[0.5em]">{{ 'home.hero.tape' | transloco }}&nbsp;—&nbsp;{{ 'home.hero.tape' | transloco }}&nbsp;—&nbsp;</span>
            }
          </div>
        </div>

        <a routerLink="/tienda" class="absolute inset-0" [attr.aria-label]="'home.hero.cta' | transloco"></a>

        <div class="pointer-events-none absolute inset-x-0 bottom-0 grid gap-6 p-5 md:grid-cols-[1fr_auto] md:items-end md:p-8">
          @for (s of slides; track s.image; let i = $index) {
            @if (i === index()) {
              <div class="caption max-w-md">
                <p class="mono opacity-80">{{ 'home.hero.season' | transloco }} · {{ pad(i + 1) }}/{{ pad(slides.length) }}</p>
                <h1 class="headline mt-3 text-[clamp(26px,3.4vw,46px)]">{{ 'home.hero.title.' + s.key | transloco }}</h1>
                <p class="mono mt-3 max-w-sm opacity-85">{{ 'home.hero.text.' + s.key | transloco }}</p>
              </div>
            }
          }
          <div class="pointer-events-auto flex items-center gap-3">
            <a routerLink="/tienda" class="btn btn-light">{{ 'home.hero.cta' | transloco }}<ui-icon name="arrow-right" [size]="16" /></a>
            <a routerLink="/look" class="btn border-white/70 text-white hover:border-white hover:bg-white hover:text-black">{{ 'home.hero.ctaLook' | transloco }}</a>
          </div>
        </div>

        <div class="absolute inset-x-5 top-5 flex items-center gap-4 md:inset-x-8 md:top-7">
          <div class="flex flex-1 gap-2" aria-hidden="true">
            @for (s of slides; track s.image; let i = $index) {
              <div class="bar" [class.on]="i === index()" [class.done]="i < index()"><span (animationend)="next()"></span></div>
            }
          </div>
          <div class="flex items-center gap-1">
            <button type="button" class="grid size-9 place-items-center rounded-full bg-black/25 backdrop-blur" (click)="go(-1)" [attr.aria-label]="'home.hero.prev' | transloco">
              <ui-icon name="chevron-left" [size]="16" />
            </button>
            <button type="button" class="grid size-9 place-items-center rounded-full bg-black/25 backdrop-blur" (click)="go(1)" [attr.aria-label]="'home.hero.next' | transloco">
              <ui-icon name="chevron-right" [size]="16" />
            </button>
            <button type="button" class="grid size-9 place-items-center rounded-full bg-black/25 backdrop-blur" (click)="toggle()"
              [attr.aria-label]="(paused() ? 'home.play' : 'home.pause') | transloco" [attr.aria-pressed]="paused()">
              <ui-icon [name]="paused() ? 'play' : 'pause'" [size]="14" />
            </button>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class HeroCampaignComponent {
  readonly slides = SLIDES;
  readonly duration = DURATION;
  readonly index = signal(0);
  readonly paused = signal(false);
  readonly current = computed(() => SLIDES[this.index()]);
  private readonly sound = inject(SoundService);

  constructor() {
    try {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.paused.set(true);
    } catch {
      /* sin matchMedia: se anima */
    }
    // Precarga de las siguientes diapositivas cuando la primera ya se ve.
    const t = setTimeout(() => SLIDES.slice(1).forEach((s) => (new Image().src = innerWidth > 1100 ? s.image : s.small)), 1500);
    inject(DestroyRef).onDestroy(() => clearTimeout(t));
  }

  pad(n: number) {
    return String(n).padStart(2, '0');
  }

  next() {
    this.index.update((i) => (i + 1) % SLIDES.length);
  }

  go(step: number) {
    this.sound.play('tick');
    this.index.update((i) => (i + step + SLIDES.length) % SLIDES.length);
  }

  toggle() {
    this.paused.update((p) => !p);
  }
}
