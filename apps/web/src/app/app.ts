import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Locale } from '@vestirse/shared-types';
import { AuthStore } from './core/auth.store';
import { ComparisonStore } from './core/comparison/comparison.store';
import { LOCALES, setLocale } from './core/i18n';
import { localPrefs } from './core/local-prefs';
import { NoticesComponent } from './shared/ui/notice.component';

type Theme = 'system' | 'light' | 'dark';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe, NoticesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn">{{ 'nav.skip' | transloco }}</a>
    <header class="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--paper)]/90 backdrop-blur">
      <nav class="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2" [attr.aria-label]="'nav.main' | transloco">
        <a routerLink="/" class="mr-auto flex items-center gap-2 font-display text-xl font-semibold">
          <img src="icons/icon.svg" alt="" class="size-7" /> Vestirse
        </a>
        <a routerLink="/comparar" routerLinkActive="bg-[var(--surface-2)]" class="btn btn-ghost text-sm">
          {{ 'nav.compare' | transloco }}
          @if (comparison.count()) {<span class="rounded-full bg-[var(--accent)] px-1.5 text-xs text-[var(--accent-ink)]">{{ comparison.count() }}</span>}
        </a>
        <a routerLink="/cuenta" routerLinkActive="bg-[var(--surface-2)]" class="btn btn-ghost text-sm hidden sm:inline-flex">
          {{ (auth.user() ? 'nav.account' : 'nav.signIn') | transloco }}
        </a>
        <button type="button" class="btn btn-ghost text-sm w-11 px-0" (click)="toggleLocale()" [attr.aria-label]="'nav.language' | transloco">
          {{ locale() === 'es' ? 'EN' : 'ES' }}
        </button>
        <button type="button" class="btn btn-ghost text-sm w-11 px-0" (click)="cycleTheme()" [attr.aria-label]="'nav.theme.' + theme() | transloco">
          {{ theme() === 'dark' ? '☾' : theme() === 'light' ? '☀' : '◐' }}
        </button>
      </nav>
    </header>
    <main id="main">
      <router-outlet />
    </main>
    <footer class="border-t border-[var(--line)] mt-8">
      <div class="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-[var(--muted)]">
        <a routerLink="/privacidad" class="underline">{{ 'nav.privacy' | transloco }}</a>
        <a routerLink="/cuenta" class="underline sm:hidden">{{ 'nav.account' | transloco }}</a>
        <span>{{ 'footer.promise' | transloco }}</span>
      </div>
    </footer>
    <ui-notices />
  `,
})
export class App {
  readonly auth = inject(AuthStore);
  readonly comparison = inject(ComparisonStore);
  private readonly transloco = inject(TranslocoService);
  readonly locale = signal<Locale>(this.transloco.getActiveLang() as Locale);
  readonly theme = signal<Theme>(localPrefs.read<Theme>('theme', 'system'));

  constructor() {
    void this.auth.refresh();
    document.documentElement.lang = this.locale();
    this.applyTheme();
  }

  toggleLocale() {
    const next = LOCALES.find((l) => l !== this.locale())!;
    setLocale(this.transloco, next);
    this.locale.set(next);
  }

  cycleTheme() {
    const order: Theme[] = ['system', 'light', 'dark'];
    this.theme.set(order[(order.indexOf(this.theme()) + 1) % order.length]);
    localPrefs.write('theme', this.theme());
    this.applyTheme();
  }

  private applyTheme() {
    const t = this.theme();
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
}
