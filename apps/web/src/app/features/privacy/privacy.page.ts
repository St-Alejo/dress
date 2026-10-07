import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';

/** Sección 8 en lenguaje claro: qué pasa con tus datos en cada modo. */
@Component({
  selector: 'app-privacy-page',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="mx-auto max-w-2xl px-4 pt-10 pb-16">
      <header>
        <h1 class="text-[28px] md:text-[32px]">{{ 'privacy.title' | transloco }}</h1>
      </header>
      <div class="mt-8 divide-y divide-line border-y border-line">
        @for (s of sections; track s) {
          <section class="grid gap-2 py-6 md:grid-cols-[200px_1fr] md:gap-8">
            <h2 class="text-[15px] font-medium">{{ 'privacy.' + s + '.title' | transloco }}</h2>
            <p class="text-[14px] text-ink-2">{{ 'privacy.' + s + '.body' | transloco: { hours: ttl() } }}</p>
          </section>
        }
      </div>
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
