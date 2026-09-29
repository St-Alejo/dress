import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';

/** Sección 8 en lenguaje claro: qué pasa con tus datos en cada modo. */
@Component({
  selector: 'app-privacy-page',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="mx-auto max-w-2xl px-4 pt-8 pb-16 space-y-6">
      <header>
        <p class="eyebrow">{{ 'privacy.eyebrow' | transloco }}</p>
        <h1 class="mt-2 text-3xl">{{ 'privacy.title' | transloco }}</h1>
      </header>
      @for (s of sections; track s) {
        <section class="card p-5">
          <h2 class="text-lg">{{ 'privacy.' + s + '.title' | transloco }}</h2>
          <p class="mt-2 text-sm text-[var(--ink-2)]">{{ 'privacy.' + s + '.body' | transloco: { hours: ttl() } }}</p>
        </section>
      }
    </article>
  `,
})
export class PrivacyPage {
  readonly ttl = signal(24);
  readonly sections = ['similar', 'live', 'photo', 'measurements', 'training', 'deletion', 'body'];

  constructor() {
    void inject(ApiService)
      .privacyPolicy()
      .then((p) => this.ttl.set(p.photoTtlHours))
      .catch(() => undefined);
  }
}
