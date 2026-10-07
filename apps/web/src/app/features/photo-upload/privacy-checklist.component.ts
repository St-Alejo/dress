import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Checklist de privacidad de una sola pantalla (paso 5 / sección 8.6):
 * se muestra siempre antes de la primera subida de la sesión, no escondido en términos.
 */
@Component({
  selector: 'app-privacy-checklist',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card p-5 space-y-4" aria-labelledby="pc-title">
      <div>
        <p class="eyebrow">{{ 'photo.checklist.eyebrow' | transloco }}</p>
        <h3 id="pc-title" class="text-xl mt-1">{{ 'photo.checklist.title' | transloco }}</h3>
      </div>
      <ul class="space-y-2">
        @for (item of items; track item; let i = $index) {
          <li>
            <label class="flex items-start gap-3 border border-line p-3 cursor-pointer">
              <input type="checkbox" class="mt-1 size-5 accent-[var(--accent)]" [checked]="checked()[i]" (change)="toggle(i)" />
              <span class="text-sm">{{ 'photo.checklist.' + item | transloco }}</span>
            </label>
          </li>
        }
      </ul>
      <div class="bg-surface-2 p-4 text-sm space-y-1.5 text-ink-2">
        <p>{{ 'photo.checklist.ttl' | transloco: { hours: ttlHours() } }}</p>
        <p>{{ 'photo.checklist.noTraining' | transloco }}</p>
        <p>{{ 'photo.checklist.deleteAnytime' | transloco }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn btn-primary" [disabled]="!allChecked()" (click)="accepted.emit()">
          {{ 'photo.checklist.continue' | transloco }}
        </button>
        <button type="button" class="btn btn-ghost" (click)="cancelled.emit()">{{ 'common.notNow' | transloco }}</button>
      </div>
    </section>
  `,
})
export class PrivacyChecklistComponent {
  readonly ttlHours = input(24);
  readonly accepted = output<void>();
  readonly cancelled = output<void>();

  readonly items = ['cropFace', 'neutralBackground', 'onlyYou'] as const;
  readonly checked = signal([false, false, false]);
  readonly allChecked = computed(() => this.checked().every(Boolean));

  toggle(i: number) {
    this.checked.update((c) => c.map((v, k) => (k === i ? !v : v)));
  }
}
