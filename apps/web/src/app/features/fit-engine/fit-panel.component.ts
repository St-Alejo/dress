import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { BodyMeasurements, SizeChartEntry } from '@vestirse/shared-types';
import { TryOnSessionStore } from '../../core/tryon-session.store';

/**
 * Track C — "¿Es mi talla?". Solo la altura es obligatoria. La recomendación
 * se muestra con su confianza y su porqué, y la persona siempre puede cambiarla.
 */
@Component({
  selector: 'app-fit-panel',
  imports: [FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card p-5 space-y-4" aria-labelledby="fit-title">
      <div class="flex items-baseline justify-between gap-3">
        <h2 id="fit-title" class="text-xl">{{ 'fit.title' | transloco }}</h2>
        @if (store.measurements()) {
          <button type="button" class="text-sm underline text-[var(--muted)]" (click)="editing.set(!editing())">
            {{ (editing() ? 'common.close' : 'fit.editMeasurements') | transloco }}
          </button>
        }
      </div>

      @if (!store.measurements() || editing()) {
        <form class="space-y-3" (ngSubmit)="submit()">
          <label class="field">
            <span>{{ 'fit.height' | transloco }} <span class="text-[var(--muted)]">(cm)</span></span>
            <input type="number" name="height" inputmode="numeric" min="120" max="230" required [(ngModel)]="height" />
          </label>
          <details class="rounded-xl border border-[var(--line)] p-3" [open]="!!chest || !!waist || !!hip">
            <summary class="cursor-pointer text-sm font-medium">{{ 'fit.optionalMore' | transloco }}</summary>
            <p class="mt-2 text-xs text-[var(--muted)]">{{ 'fit.optionalHelp' | transloco }}</p>
            <div class="mt-3 grid grid-cols-3 gap-2">
              <label class="field"><span>{{ 'fit.chest' | transloco }}</span><input type="number" name="chest" inputmode="numeric" min="50" max="200" [(ngModel)]="chest" /></label>
              <label class="field"><span>{{ 'fit.waist' | transloco }}</span><input type="number" name="waist" inputmode="numeric" min="40" max="200" [(ngModel)]="waist" /></label>
              <label class="field"><span>{{ 'fit.hip' | transloco }}</span><input type="number" name="hip" inputmode="numeric" min="50" max="200" [(ngModel)]="hip" /></label>
            </div>
          </details>
          @if (store.poseRatios()) {
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" class="mt-1 size-4" [checked]="store.usePoseRatios()" (change)="store.usePoseRatios.set(!store.usePoseRatios())" name="usePose" />
              <span>{{ 'fit.usePose' | transloco }}</span>
            </label>
          }
          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" class="mt-1 size-4" [checked]="store.rememberMeasurements()" (change)="store.setRemember(!store.rememberMeasurements())" name="remember" />
            <span>{{ 'fit.remember' | transloco }}</span>
          </label>
          @if (formError()) {
            <p class="text-sm text-[var(--danger)]" role="alert">{{ formError()! | transloco }}</p>
          }
          <button type="submit" class="btn btn-primary" [disabled]="store.fitLoading()">{{ 'fit.submit' | transloco }}</button>
        </form>
      }

      @if (store.fit(); as fit) {
        <div class="space-y-3" aria-live="polite">
          <div class="flex flex-wrap items-center gap-3">
            <p class="text-lg">
              {{ 'fit.recommended' | transloco }} <strong class="text-2xl font-display">{{ fit.recommendedSize }}</strong>
            </p>
            <span class="rounded-full px-3 py-1 text-xs font-semibold"
              [style.background]="'var(--conf-' + fit.confidence + '-soft)'" [style.color]="'var(--conf-' + fit.confidence + ')'">
              {{ 'fit.confidence.' + fit.confidence | transloco }}
            </span>
          </div>
          @if (fit.alternativeSize) {
            <p class="text-sm text-[var(--ink-2)]">{{ 'fit.alternative' | transloco: { size: fit.alternativeSize } }}</p>
          }
          <ul class="text-sm text-[var(--ink-2)] space-y-1">
            @for (b of fit.basis; track b) {
              <li class="flex gap-2"><span aria-hidden="true">·</span>{{ b | transloco }}</li>
            }
          </ul>

          <div>
            <p id="size-choice" class="text-sm font-medium mb-2">{{ 'fit.yourSize' | transloco }}</p>
            <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="size-choice">
              @for (s of sizes(); track s) {
                <button type="button" class="chip" role="radio" [attr.aria-checked]="store.chosenSize() === s" [attr.aria-pressed]="store.chosenSize() === s" (click)="store.overrideSize(s)">
                  {{ s }}
                </button>
              }
            </div>
            @if (fit.userOverride) {
              <p class="mt-2 text-xs text-[var(--muted)]">{{ 'fit.overridden' | transloco: { size: fit.userOverride } }}</p>
            }
          </div>

          @if (store.measurements()) {
            <button type="button" class="text-xs underline text-[var(--muted)]" (click)="store.forgetMeasurements()">{{ 'fit.forget' | transloco }}</button>
          }
        </div>
      }

      @if (chart().length > 1) {
        <details class="text-sm">
          <summary class="cursor-pointer text-[var(--ink-2)]">{{ 'fit.sizeChart' | transloco }}</summary>
          <div class="mt-2 overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="text-[var(--muted)]">
                <tr><th class="py-1 pr-3">{{ 'fit.size' | transloco }}</th><th class="pr-3">{{ 'fit.chest' | transloco }}</th><th class="pr-3">{{ 'fit.waist' | transloco }}</th><th>{{ 'fit.hip' | transloco }}</th></tr>
              </thead>
              <tbody>
                @for (e of chart(); track e.size) {
                  <tr class="border-t border-[var(--line)]">
                    <td class="py-1 pr-3 font-medium">{{ e.size }}</td>
                    <td class="pr-3">{{ range(e.chestCm) }}</td>
                    <td class="pr-3">{{ range(e.waistCm) }}</td>
                    <td>{{ range(e.hipCm) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      }
    </section>
  `,
})
export class FitPanelComponent {
  readonly store = inject(TryOnSessionStore);
  readonly editing = signal(false);
  readonly formError = signal<string | null>(null);

  height: number | null = this.store.measurements()?.heightCm ?? null;
  chest: number | null = this.store.measurements()?.chestCm ?? null;
  waist: number | null = this.store.measurements()?.waistCm ?? null;
  hip: number | null = this.store.measurements()?.hipCm ?? null;

  readonly chart = computed<SizeChartEntry[]>(() => this.store.garment()?.sizeChart ?? []);
  readonly sizes = computed(() => this.chart().map((e) => e.size));

  range(r?: [number, number]) {
    return r ? `${r[0]}–${r[1]}` : '—';
  }

  async submit() {
    const h = Number(this.height);
    if (!h || h < 120 || h > 230) {
      this.formError.set('fit.error.height');
      return;
    }
    this.formError.set(null);
    const m: BodyMeasurements = { heightCm: h };
    if (this.chest) m.chestCm = Number(this.chest);
    if (this.waist) m.waistCm = Number(this.waist);
    if (this.hip) m.hipCm = Number(this.hip);
    try {
      await this.store.estimate(m);
      this.editing.set(false);
    } catch {
      this.formError.set('fit.error.generic');
    }
  }
}
