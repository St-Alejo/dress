import { ChangeDetectionStrategy, Component, DestroyRef, inject, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { tabPrefs } from '../../core/local-prefs';
import { SoundService } from '../../core/sound';

const FRAMES = ['campaign/hero-1.webp', 'campaign/textura.webp', 'campaign/hero-3.webp', 'campaign/cat-dress.webp', 'campaign/hero-2.webp'];

/**
 * Cabecera de película al abrir la portada (una vez por pestaña): el nombre gigante relleno de las
 * fotos de campaña, un contador de carga y una cortinilla que sube. Un clic o una tecla la saltan.
 * Con "reducir movimiento" no aparece.
 */
@Component({
  selector: 'app-intro',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.leaving]': 'leaving()', '(click)': 'finish()', '(keydown)': 'finish()', tabindex: '-1', role: 'presentation' },
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 90;
      display: grid;
      grid-template-rows: auto 1fr auto;
      padding: 20px clamp(16px, 3vw, 40px);
      background: var(--night);
      color: var(--night-ink);
      clip-path: inset(0 0 0 0);
      transition: clip-path 0.9s var(--ease-film);
      cursor: pointer;
    }
    :host(.leaving) {
      clip-path: inset(0 0 100% 0);
    }
    .word {
      align-self: center;
      font-family: var(--font-display);
      font-stretch: 125%;
      font-weight: 900;
      font-size: clamp(48px, 14.5vw, 300px);
      line-height: 0.82;
      letter-spacing: -0.05em;
      text-transform: uppercase;
      text-align: center;
      color: transparent;
      background-size: cover;
      background-position: center 30%;
      -webkit-background-clip: text;
      background-clip: text;
      white-space: nowrap;
      animation:
        rise 1.1s var(--ease-out) both,
        wipe 1.2s var(--ease-film) both;
    }
    @keyframes rise {
      from {
        transform: translateY(14%) scale(1.04);
        filter: blur(6px);
      }
    }
    @keyframes wipe {
      from {
        clip-path: inset(0 100% 0 0);
      }
      to {
        clip-path: inset(0 0 0 0);
      }
    }
  `,
  template: `
    <div class="mono flex justify-between opacity-70">
      <span>{{ 'intro.studio' | transloco }}</span><span class="tabular">{{ pad(count()) }}%</span>
    </div>
    <h2 class="word" [style.background-image]="'url(' + frame() + ')'">Vestirse</h2>
    <div class="mono flex justify-between gap-4 opacity-70">
      <span>{{ 'intro.tagline' | transloco }}</span><span>{{ 'intro.skip' | transloco }}</span>
    </div>
  `,
})
export class IntroComponent {
  readonly done = output<void>();
  readonly count = signal(0);
  readonly frame = signal(FRAMES[0]);
  readonly leaving = signal(false);
  private readonly sound = inject(SoundService);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private tick?: ReturnType<typeof setInterval>;

  /** Solo la primera vez en la pestaña y si no se pidió menos movimiento. */
  static shouldPlay(): boolean {
    try {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    } catch {
      return false;
    }
    return !tabPrefs.read<boolean>('intro', false);
  }

  constructor() {
    tabPrefs.write('intro', true);
    // Precarga de las fotos para que el relleno no parpadee.
    for (const f of FRAMES) new Image().src = f;
    const start = performance.now();
    const total = 2100;
    this.tick = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / total);
      this.count.set(Math.round(100 * (1 - Math.pow(1 - t, 3))));
      this.frame.set(FRAMES[Math.min(FRAMES.length - 1, Math.floor(t * FRAMES.length))]);
      if (t >= 1) this.finish();
    }, 50);
    inject(DestroyRef).onDestroy(() => {
      this.clear();
      this.timers.forEach(clearTimeout);
    });
  }

  pad(n: number) {
    return String(n).padStart(3, '0');
  }

  finish() {
    if (this.leaving()) return;
    this.clear();
    this.count.set(100);
    this.leaving.set(true);
    this.sound.play('whoosh');
    this.timers.push(setTimeout(() => this.done.emit(), 900));
  }

  private clear() {
    if (this.tick) clearInterval(this.tick);
    this.tick = undefined;
  }
}
