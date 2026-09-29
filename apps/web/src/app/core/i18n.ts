import { HttpClient } from '@angular/common/http';
import { Injectable, inject, isDevMode } from '@angular/core';
import { provideTransloco, TranslocoService, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import type { Locale } from '@vestirse/shared-types';
import { localPrefs } from './local-prefs';

@Injectable({ providedIn: 'root' })
export class HttpTranslocoLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  getTranslation(lang: string) {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}

export const LOCALES: Locale[] = ['es', 'en'];

export function initialLocale(): Locale {
  const saved = localPrefs.read<Locale | null>('locale', null);
  if (saved && LOCALES.includes(saved)) return saved;
  const nav = globalThis.navigator?.language?.slice(0, 2) as Locale | undefined;
  return nav && LOCALES.includes(nav) ? nav : 'es';
}

export function provideI18n() {
  return provideTransloco({
    config: {
      availableLangs: LOCALES,
      defaultLang: initialLocale(),
      fallbackLang: 'es',
      missingHandler: { useFallbackTranslation: true, logMissingKey: isDevMode() },
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
    },
    loader: HttpTranslocoLoader,
  });
}

export function setLocale(t: TranslocoService, locale: Locale) {
  t.setActiveLang(locale);
  localPrefs.write('locale', locale);
  document.documentElement.lang = locale;
}
