import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

interface PhotoCredit {
  title: string;
  creator: string;
  creator_url?: string;
  license: string;
  license_url?: string;
  source_url: string;
  provider?: string;
}

type CreditsFile = Record<'garments' | 'bodies', Record<string, PhotoCredit>>;

/** Atribución de las fotos del catálogo: las licencias CC BY y BY-SA exigen nombrar autor, obra y licencia. */
@Component({
  selector: 'app-credits-page',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="mx-auto max-w-screen-lg px-4 pt-10 pb-16 md:px-8">
      <header class="max-w-2xl">
        <h1 class="text-[28px] md:text-[32px]">{{ 'credits.title' | transloco }}</h1>
        <p class="mt-3 text-[14px] text-ink-2">{{ 'credits.lead' | transloco }}</p>
      </header>
      @for (group of groups(); track group.kind) {
        <section class="mt-10">
          <h2 class="label-xs border-b border-line pb-2">{{ 'credits.' + group.kind | transloco }}</h2>
          <ul class="divide-y divide-line">
            @for (c of group.items; track c.key) {
              <li class="flex gap-4 py-4">
                <img [src]="'/api/media/catalog/' + group.kind + '/' + c.key + '/photo.jpg'" alt="" loading="lazy" class="h-20 w-16 shrink-0 bg-surface-2 object-cover" />
                <div class="min-w-0 text-[13px]">
                  <p class="font-medium"><a [href]="c.source_url" target="_blank" rel="noopener" class="hover:underline">{{ c.title }}</a></p>
                  <p class="text-ink-2">
                    {{ 'credits.by' | transloco }}
                    @if (c.creator_url) {<a [href]="c.creator_url" target="_blank" rel="noopener" class="underline">{{ c.creator }}</a>} @else {<span>{{ c.creator }}</span>}
                    @if (c.provider) {<span class="text-muted"> · {{ c.provider }}</span>}
                  </p>
                  <p class="text-muted">
                    @if (c.license_url) {<a [href]="c.license_url" target="_blank" rel="noopener" class="underline">{{ c.license }}</a>} @else {<span>{{ c.license }}</span>}
                  </p>
                </div>
              </li>
            }
          </ul>
        </section>
      }
      @if (failed()) {
        <p class="mt-8 border border-line p-6 text-center text-ink-2" role="alert">{{ 'common.loadError' | transloco }}</p>
      }
    </article>
  `,
})
export class CreditsPage {
  private readonly data = signal<CreditsFile | null>(null);
  readonly failed = signal(false);
  readonly groups = computed(() => {
    const d = this.data();
    if (!d) return [];
    return (['garments', 'bodies'] as const).map((kind) => ({
      kind,
      items: Object.entries(d[kind] ?? {}).map(([key, c]) => ({ key, ...c })),
    }));
  });

  constructor() {
    fetch('/photo-credits.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: CreditsFile) => this.data.set(d))
      .catch(() => this.failed.set(true));
  }
}
