import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Locale } from '@vestirse/shared-types';
import { filter } from 'rxjs';
import { AuthStore } from './core/auth.store';
import { ComparisonStore } from './core/comparison/comparison.store';
import { LOCALES, setLocale } from './core/i18n';
import { ThemeService } from './core/theme';
import { IconComponent, type IconName } from './shared/ui/icon.component';
import { NoticesComponent } from './shared/ui/notice.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe, NoticesComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a href="#main" class="btn btn-primary sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50">{{ 'nav.skip' | transloco }}</a>

    <header class="sticky top-0 z-40 border-b border-line bg-paper">
      <nav class="mx-auto flex h-14 max-w-screen-2xl items-center gap-6 px-4 md:px-8" [attr.aria-label]="'nav.main' | transloco">
        <button type="button" class="-ml-2 grid size-11 place-items-center md:hidden" [attr.aria-label]="'nav.menu' | transloco" aria-haspopup="dialog" (click)="openMenu()">
          <ui-icon name="menu" />
        </button>

        <a routerLink="/" class="text-[15px] font-semibold uppercase tracking-[0.28em]" aria-label="Vestirse">Vestirse</a>

        <ul class="hidden items-center gap-6 md:flex">
          <li><a routerLink="/" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="nav-active" class="nav-link">{{ 'nav.catalog' | transloco }}</a></li>
          <li>
            <a routerLink="/comparar" routerLinkActive="nav-active" class="nav-link">
              {{ 'nav.compare' | transloco }}@if (comparison.count()) {<span class="tabular"> ({{ comparison.count() }})</span>}
            </a>
          </li>
        </ul>

        <div class="ml-auto flex items-center gap-1">
          <a routerLink="/cuenta" routerLinkActive="nav-active" class="nav-link mr-3 hidden md:inline">
            {{ (auth.user() ? 'nav.account' : 'nav.signIn') | transloco }}
          </a>
          <button type="button" class="nav-link grid h-11 min-w-11 place-items-center" (click)="toggleLocale()" [attr.aria-label]="'nav.language' | transloco">
            {{ locale() === 'es' ? 'EN' : 'ES' }}
          </button>
          <button type="button" class="grid size-11 place-items-center text-ink-2 hover:text-ink" (click)="theme.cycle()" [attr.aria-label]="'nav.theme.' + theme.preference() | transloco">
            <ui-icon [name]="themeIcon()" [size]="18" />
          </button>
          <a routerLink="/comparar" class="relative grid size-11 place-items-center md:hidden" [attr.aria-label]="'nav.compare' | transloco">
            <ui-icon name="compare" [size]="18" />
            @if (comparison.count()) {
              <span class="absolute right-1.5 top-1.5 grid size-4 place-items-center bg-ink text-[10px] text-paper tabular">{{ comparison.count() }}</span>
            }
          </a>
        </div>
      </nav>
    </header>

    <!-- Menú móvil: <dialog> modal nativo (foco atrapado, Esc y fondo inerte sin código extra). -->
    <dialog #menu class="m-0 h-dvh max-h-none w-[min(86vw,360px)] max-w-none bg-paper p-0 text-ink backdrop:bg-black/40" [attr.aria-label]="'nav.menu' | transloco" (click)="onDialogClick($event)">
      <div class="flex h-full flex-col">
      <div class="flex h-14 items-center justify-between border-b border-line px-4">
        <span class="text-[15px] font-semibold uppercase tracking-[0.28em]">Vestirse</span>
        <button type="button" class="-mr-2 grid size-11 place-items-center" [attr.aria-label]="'common.close' | transloco" (click)="closeMenu()">
          <ui-icon name="close" />
        </button>
      </div>
      <ul class="divide-y divide-line border-b border-line">
        @for (link of menuLinks(); track link.path) {
          <li>
            <a [routerLink]="link.path" class="flex min-h-14 items-center justify-between px-4 text-[13px] uppercase tracking-[0.08em]">
              {{ link.label | transloco }}
              <ui-icon name="chevron-right" [size]="16" />
            </a>
          </li>
        }
      </ul>
      <p class="px-4 py-6 text-[13px] text-muted">{{ 'footer.promise' | transloco }}</p>
      </div>
    </dialog>

    <main id="main" tabindex="-1" class="outline-none">
      <router-outlet />
    </main>

    <footer class="mt-16 border-t border-line">
      <div class="mx-auto grid max-w-screen-2xl gap-8 px-4 py-10 md:grid-cols-[2fr_1fr_1fr] md:px-8">
        <div class="space-y-3">
          <p class="text-[13px] font-semibold uppercase tracking-[0.28em]">Vestirse</p>
          <p class="max-w-sm text-[13px] text-ink-2">{{ 'footer.promise' | transloco }}</p>
        </div>
        <nav [attr.aria-label]="'footer.explore' | transloco">
          <p class="label-xs mb-3">{{ 'footer.explore' | transloco }}</p>
          <ul class="space-y-2 text-[13px]">
            <li><a routerLink="/" class="hover:underline">{{ 'nav.catalog' | transloco }}</a></li>
            <li><a routerLink="/comparar" class="hover:underline">{{ 'nav.compare' | transloco }}</a></li>
          </ul>
        </nav>
        <nav [attr.aria-label]="'footer.help' | transloco">
          <p class="label-xs mb-3">{{ 'footer.help' | transloco }}</p>
          <ul class="space-y-2 text-[13px]">
            <li><a routerLink="/privacidad" class="hover:underline">{{ 'nav.privacy' | transloco }}</a></li>
            <li><a routerLink="/creditos" class="hover:underline">{{ 'nav.credits' | transloco }}</a></li>
            <li><a routerLink="/cuenta" class="hover:underline">{{ (auth.user() ? 'nav.account' : 'nav.signIn') | transloco }}</a></li>
          </ul>
        </nav>
      </div>
    </footer>

    <ui-notices />
  `,
  styles: `
    .nav-link {
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-2);
      text-underline-offset: 6px;
    }
    .nav-link:hover,
    .nav-active {
      color: var(--ink);
      text-decoration: underline;
      text-decoration-thickness: 1px;
    }
  `,
})
export class App {
  readonly auth = inject(AuthStore);
  readonly comparison = inject(ComparisonStore);
  readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);
  private readonly menu = viewChild.required<ElementRef<HTMLDialogElement>>('menu');

  private navigated = false;
  readonly locale = signal<Locale>(this.transloco.getActiveLang() as Locale);
  readonly themeIcon = computed<IconName>(() => ({ system: 'contrast', light: 'sun', dark: 'moon' }) [this.theme.preference()] as IconName);
  readonly menuLinks = computed(() => [
    { path: '/', label: 'nav.catalog' },
    { path: '/comparar', label: 'nav.compare' },
    { path: '/cuenta', label: this.auth.user() ? 'nav.account' : 'nav.signIn' },
    { path: '/privacidad', label: 'nav.privacy' },
  ]);

  constructor() {
    void this.auth.refresh();
    document.documentElement.lang = this.locale();
    // Al navegar: se cierra el menú y el foco va al contenido (lectores de pantalla anuncian la nueva página).
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        this.closeMenu();
        if (this.navigated) document.getElementById('main')?.focus({ preventScroll: true });
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

  /** Clic en el fondo (fuera del panel) cierra el menú. */
  onDialogClick(event: MouseEvent) {
    if (event.target === this.menu().nativeElement) this.closeMenu();
  }

  toggleLocale() {
    const next = LOCALES.find((l) => l !== this.locale())!;
    setLocale(this.transloco, next);
    this.locale.set(next);
  }
}
