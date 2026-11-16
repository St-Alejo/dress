import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Locale } from '@vestirse/shared-types';
import { filter } from 'rxjs';
import { AuthStore } from './core/auth.store';
import { CartStore } from './core/cart.store';
import { ComparisonStore } from './core/comparison/comparison.store';
import { LOCALES, setLocale } from './core/i18n';
import { ProfileStore } from './core/profile.store';
import { SoundService } from './core/sound';
import { ThemeService } from './core/theme';
import { CrosshairCursorComponent } from './shared/motion/crosshair-cursor.component';
import { IntroComponent } from './shared/motion/intro.component';
import { IconComponent, type IconName } from './shared/ui/icon.component';
import { NoticesComponent } from './shared/ui/notice.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe, NoticesComponent, IconComponent, CrosshairCursorComponent, IntroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a href="#main" class="btn btn-primary sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50">{{ 'nav.skip' | transloco }}</a>

    <header class="site-header sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <nav class="mx-auto grid h-14 max-w-screen-2xl grid-cols-[1fr_auto_1fr] items-center gap-6 px-4 md:px-8" [attr.aria-label]="'nav.main' | transloco">
        <div class="flex items-center gap-2">
          <button type="button" class="-ml-2 grid size-11 place-items-center md:hidden" [attr.aria-label]="'nav.menu' | transloco" aria-haspopup="dialog" (click)="openMenu()">
            <ui-icon name="menu" />
          </button>
          <a routerLink="/" class="wordmark" aria-label="Vestirse" (click)="sound.play('tick')">Vestirse</a>
        </div>

        <ul class="hidden items-center gap-8 md:flex">
          <li><a routerLink="/tienda" routerLinkActive="is-active" class="nav-link link-line">{{ 'nav.catalog' | transloco }}</a></li>
          <li><a routerLink="/look" routerLinkActive="is-active" class="nav-link link-line">{{ 'nav.look' | transloco }}</a></li>
          <li><a routerLink="/favoritos" routerLinkActive="is-active" class="nav-link link-line">{{ 'nav.favorites' | transloco }}</a></li>
          <li>
            <a routerLink="/comparar" routerLinkActive="is-active" class="nav-link link-line">
              {{ 'nav.compare' | transloco }}@if (comparison.count()) {<span class="tabular"> ({{ comparison.count() }})</span>}
            </a>
          </li>
        </ul>

        <div class="flex items-center justify-end gap-0.5">
          <a routerLink="/cuenta" routerLinkActive="is-active" class="nav-link link-line mr-4 hidden md:inline">
            {{ (auth.user() ? 'nav.account' : 'nav.signIn') | transloco }}
          </a>
          <button type="button" class="nav-link hidden h-11 min-w-10 place-items-center sm:grid" (click)="toggleLocale()" [attr.aria-label]="'nav.language' | transloco">
            {{ locale() === 'es' ? 'EN' : 'ES' }}
          </button>
          <button type="button" class="icon-btn hidden sm:grid" (click)="theme.cycle()" [attr.aria-label]="'nav.theme.' + theme.preference() | transloco">
            <ui-icon [name]="themeIcon()" [size]="17" />
          </button>
          <button type="button" class="icon-btn hidden sm:grid" (click)="sound.toggle()" [attr.aria-pressed]="sound.enabled()" [attr.aria-label]="'nav.sound' | transloco">
            <ui-icon [name]="sound.enabled() ? 'sound-on' : 'sound-off'" [size]="17" />
          </button>
          <a routerLink="/favoritos" routerLinkActive="is-active" class="icon-btn md:hidden" [attr.aria-label]="'nav.favorites' | transloco">
            <ui-icon name="heart" [size]="17" />
          </a>
          <a routerLink="/carrito" routerLinkActive="is-active" class="nav-link link-line ml-2 inline-flex h-11 items-center gap-1.5"
            [attr.aria-label]="('nav.cart' | transloco) + (cart.count() ? ' (' + cart.count() + ')' : '')">
            <span aria-hidden="true">{{ 'nav.bag' | transloco }}</span>
            <span class="count tabular" aria-hidden="true">{{ cart.count() }}</span>
          </a>
        </div>
      </nav>
    </header>

    <!-- Menú móvil: <dialog> modal nativo a pantalla completa (foco atrapado, Esc y fondo inerte sin código extra). -->
    <dialog #menu class="menu m-0 h-dvh max-h-none w-screen max-w-none bg-night p-0 text-night-ink" [attr.aria-label]="'nav.menu' | transloco">
      <div class="flex h-full flex-col px-4 pb-8">
        <div class="flex h-14 items-center justify-between">
          <span class="wordmark">Vestirse</span>
          <button type="button" class="-mr-2 grid size-11 place-items-center" [attr.aria-label]="'common.close' | transloco" (click)="closeMenu()">
            <ui-icon name="close" />
          </button>
        </div>
        <ul class="mt-6 flex-1 space-y-1">
          @for (link of menuLinks(); track link.path; let i = $index) {
            <li class="menu-item" [style.animation-delay.ms]="80 + i * 45">
              <a [routerLink]="link.path" class="display flex items-baseline justify-between py-1 text-[clamp(30px,10vw,52px)]">
                {{ link.label | transloco }}<span class="mono text-night-ink/50 tabular">0{{ i + 1 }}</span>
              </a>
            </li>
          }
        </ul>
        <div class="mono flex items-center gap-5 text-night-ink/70">
          <button type="button" class="min-h-11" (click)="toggleLocale()">{{ locale() === 'es' ? 'English' : 'Español' }}</button>
          <button type="button" class="min-h-11" (click)="theme.cycle()">{{ 'nav.theme.' + theme.preference() | transloco }}</button>
          <button type="button" class="min-h-11" (click)="sound.toggle()">{{ (sound.enabled() ? 'nav.soundOn' : 'nav.soundOff') | transloco }}</button>
        </div>
        <p class="mt-6 max-w-sm text-[13px] text-night-ink/60">{{ 'footer.promise' | transloco }}</p>
      </div>
    </dialog>

    <main id="main" tabindex="-1" class="outline-none">
      <router-outlet />
    </main>

    <footer class="site-footer mt-24 bg-night text-night-ink">
      <div class="mx-auto grid max-w-screen-2xl gap-10 px-4 pt-16 md:grid-cols-4 md:px-8">
        <div class="space-y-3">
          <p class="mono text-night-ink/50">{{ 'footer.manifesto' | transloco }}</p>
          <p class="max-w-xs text-[13px] text-night-ink/80">{{ 'footer.promise' | transloco }}</p>
        </div>
        <nav [attr.aria-label]="'footer.explore' | transloco">
          <p class="mono mb-4 text-night-ink/50">{{ 'footer.explore' | transloco }}</p>
          <ul class="mono space-y-2.5">
            <li><a routerLink="/tienda" class="link-line">{{ 'nav.catalog' | transloco }}</a></li>
            <li><a routerLink="/look" class="link-line">{{ 'nav.look' | transloco }}</a></li>
            <li><a routerLink="/favoritos" class="link-line">{{ 'nav.favorites' | transloco }}</a></li>
            <li><a routerLink="/comparar" class="link-line">{{ 'nav.compare' | transloco }}</a></li>
            <li><a routerLink="/carrito" class="link-line">{{ 'nav.cart' | transloco }}</a></li>
          </ul>
        </nav>
        <nav [attr.aria-label]="'footer.help' | transloco">
          <p class="mono mb-4 text-night-ink/50">{{ 'footer.help' | transloco }}</p>
          <ul class="mono space-y-2.5">
            <li><a routerLink="/privacidad" class="link-line">{{ 'nav.privacy' | transloco }}</a></li>
            <li><a routerLink="/creditos" class="link-line">{{ 'nav.credits' | transloco }}</a></li>
            <li><a routerLink="/cuenta" class="link-line">{{ (auth.user() ? 'nav.account' : 'nav.signIn') | transloco }}</a></li>
          </ul>
        </nav>
        <div>
          <p class="mono mb-4 text-night-ink/50">{{ 'footer.settings' | transloco }}</p>
          <ul class="mono space-y-2.5">
            <li><button type="button" class="link-line" (click)="toggleLocale()">{{ locale() === 'es' ? 'English' : 'Español' }}</button></li>
            <li><button type="button" class="link-line" (click)="theme.cycle()">{{ 'nav.theme.' + theme.preference() | transloco }}</button></li>
            <li><button type="button" class="link-line" (click)="sound.toggle()">{{ (sound.enabled() ? 'nav.soundOn' : 'nav.soundOff') | transloco }}</button></li>
          </ul>
        </div>
      </div>
      <div class="mx-auto mt-16 flex max-w-screen-2xl items-end justify-between gap-4 overflow-hidden px-4 pb-6 md:px-8" aria-hidden="true">
        <p class="display giant">Vestirse</p>
        <p class="display hidden pb-[0.6vw] text-[clamp(28px,6vw,96px)] md:block">©{{ year }}</p>
      </div>
      <p class="mono mx-auto flex max-w-screen-2xl justify-between border-t border-white/10 px-4 py-4 text-night-ink/40 md:px-8">
        <span>© {{ year }} Vestirse</span><span>{{ 'footer.madeWith' | transloco }}</span>
      </p>
    </footer>

    @if (showIntro()) {
      <app-intro (done)="showIntro.set(false)" />
    }
    <app-crosshair-cursor />
    <ui-notices />
  `,
  styles: `
    .site-header {
      view-transition-name: site-header;
    }
    .wordmark {
      font-family: var(--font-display);
      font-stretch: 125%;
      font-weight: 900;
      font-size: 17px;
      letter-spacing: -0.03em;
      text-transform: uppercase;
    }
    .nav-link {
      white-space: nowrap;
      font-family: var(--font-mono);
      font-size: 11.5px;
      font-weight: 500;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--ink);
    }
    .icon-btn {
      display: grid;
      place-items: center;
      width: 40px;
      height: 44px;
      color: var(--ink-2);
      transition: color 0.2s;
    }
    .icon-btn:hover,
    .icon-btn.is-active {
      color: var(--ink);
    }
    .count {
      display: grid;
      place-items: center;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border: 1px solid currentColor;
      border-radius: 9999px;
      font-size: 10px;
      line-height: 1;
    }
    .menu::backdrop {
      background: transparent;
    }
    .menu[open] {
      animation: menu-in 0.6s var(--ease-film) both;
    }
    .menu-item {
      animation: fade-up 0.7s var(--ease-out) both;
    }
    @keyframes menu-in {
      from {
        clip-path: inset(0 0 100% 0);
      }
      to {
        clip-path: inset(0 0 0 0);
      }
    }
    .giant {
      white-space: nowrap;
      font-size: clamp(40px, 15.5vw, 320px);
      line-height: 0.78;
      letter-spacing: -0.055em;
      margin-bottom: -0.04em;
    }
    @media (min-width: 768px) {
      .giant {
        font-size: clamp(40px, 11vw, 280px);
      }
    }
  `,
})
export class App {
  readonly auth = inject(AuthStore);
  readonly comparison = inject(ComparisonStore);
  readonly cart = inject(CartStore);
  readonly theme = inject(ThemeService);
  readonly sound = inject(SoundService);
  private readonly transloco = inject(TranslocoService);
  private readonly menu = viewChild.required<ElementRef<HTMLDialogElement>>('menu');

  private navigated = false;
  private path = '';
  readonly year = new Date().getFullYear();
  /** La intro solo al entrar por la portada, una vez por pestaña. */
  readonly showIntro = signal(location.pathname === '/' && IntroComponent.shouldPlay());
  readonly locale = signal<Locale>(this.transloco.getActiveLang() as Locale);
  readonly themeIcon = computed<IconName>(() => ({ system: 'contrast', light: 'sun', dark: 'moon' }) [this.theme.preference()] as IconName);
  readonly menuLinks = computed(() => [
    { path: '/', label: 'nav.home' },
    { path: '/tienda', label: 'nav.catalog' },
    { path: '/look', label: 'nav.look' },
    { path: '/comparar', label: 'nav.compare' },
    { path: '/carrito', label: 'nav.cart' },
    { path: '/favoritos', label: 'nav.favorites' },
    { path: '/cuenta', label: this.auth.user() ? 'nav.account' : 'nav.signIn' },
  ]);

  constructor() {
    void this.auth.refresh();
    // El perfil se crea al arrancar: se carga al iniciar sesión y se olvida al salir.
    inject(ProfileStore);
    document.documentElement.lang = this.locale();
    // Al navegar: se cierra el menú y el foco va al contenido (lectores de pantalla anuncian la nueva página).
    // El scroll lo decide la app y no el router: cambiar filtros o prendas del look (misma ruta, solo
    // cambia la URL) no debe saltar arriba; con atrás/adelante el navegador recupera la posición.
    let fromHistory = false;
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationStart || e instanceof NavigationEnd))
      .subscribe((e) => {
        if (e instanceof NavigationStart) {
          fromHistory = e.navigationTrigger === 'popstate';
          return;
        }
        this.closeMenu();
        const path = e.urlAfterRedirects.split(/[?#]/)[0];
        // Cambiar filtros (misma ruta) no es cambiar de página: ni scroll, ni foco, ni sonido.
        if (this.navigated && path !== this.path) {
          if (!fromHistory) window.scrollTo({ top: 0, behavior: 'instant' });
          document.getElementById('main')?.focus({ preventScroll: true });
          this.sound.play('whoosh');
        }
        this.path = path;
        this.navigated = true;
      });
  }

  openMenu() {
    this.menu().nativeElement.showModal();
  }

  closeMenu() {
    const dialog = this.menu().nativeElement;
    if (dialog.open) dialog.close();
  }

  toggleLocale() {
    const next = LOCALES.find((l) => l !== this.locale())!;
    setLocale(this.transloco, next);
    this.locale.set(next);
  }
}
