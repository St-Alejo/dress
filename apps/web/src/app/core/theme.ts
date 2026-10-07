import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { localPrefs } from './local-prefs';

export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Preferencia de tema. El atributo `data-theme` siempre queda resuelto a
 * `light` o `dark` (también en modo "sistema"), así la paleta oscura se define
 * una sola vez en styles.css. El script de index.html hace lo mismo antes de pintar.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(localPrefs.read<ThemePreference>('theme', 'system'));
  private readonly media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');

  constructor() {
    const onChange = () => this.apply();
    this.media?.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.media?.removeEventListener('change', onChange));
    this.apply();
  }

  cycle() {
    const order: ThemePreference[] = ['system', 'light', 'dark'];
    this.set(order[(order.indexOf(this.preference()) + 1) % order.length]);
  }

  set(pref: ThemePreference) {
    this.preference.set(pref);
    localPrefs.write('theme', pref);
    this.apply();
  }

  private apply() {
    const pref = this.preference();
    const dark = pref === 'dark' || (pref === 'system' && !!this.media?.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
}
