import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { FitFeeling, FitReview, FitReviewSummary, FitZone, GarmentItem } from '@vestirse/shared-types';
import { ApiService } from '../../core/api.service';
import { NoticeStore } from '../../core/notice.store';

/** Reseñas de ajuste de otras personas (paso 7): contexto, no estética. */
@Component({
  selector: 'app-reviews-panel',
  imports: [FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card p-5 space-y-4" aria-labelledby="rv-title">
      <h2 id="rv-title" class="text-xl">{{ 'reviews.title' | transloco }}</h2>

      @if (loading()) {
        <p class="text-sm text-[var(--muted)]" role="status">{{ 'common.loading' | transloco }}</p>
      } @else if (loadFailed()) {
        <div class="text-sm space-y-2" role="alert">
          <p>{{ 'common.loadError' | transloco }}</p>
          <button type="button" class="btn" (click)="load()">{{ 'common.retry' | transloco }}</button>
        </div>
      }

      @if (summary(); as s) {
        @if (s.total > 0) {
          <div class="space-y-2">
            <div class="flex h-3 overflow-hidden rounded-full bg-[var(--surface-2)]" role="img" [attr.aria-label]="'reviews.barLabel' | transloco: { small: s.runsSmall, fit: s.trueToSize, large: s.runsLarge }">
              <div class="bg-[var(--conf-medium)]" [style.width.%]="pct(s.runsSmall)"></div>
              <div class="bg-[var(--conf-high)]" [style.width.%]="pct(s.trueToSize)"></div>
              <div class="bg-[var(--accent)]" [style.width.%]="pct(s.runsLarge)"></div>
            </div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-2)]">
              <span><i class="inline-block size-2 rounded-full bg-[var(--conf-medium)] mr-1"></i>{{ 'reviews.feeling.runs-small' | transloco }} · {{ s.runsSmall }}</span>
              <span><i class="inline-block size-2 rounded-full bg-[var(--conf-high)] mr-1"></i>{{ 'reviews.feeling.true-to-size' | transloco }} · {{ s.trueToSize }}</span>
              <span><i class="inline-block size-2 rounded-full bg-[var(--accent)] mr-1"></i>{{ 'reviews.feeling.runs-large' | transloco }} · {{ s.runsLarge }}</span>
            </div>
            @if (s.topZones.length) {
              <p class="text-sm">{{ 'reviews.zonesMentioned' | transloco }}
                @for (z of s.topZones; track z; let last = $last) {<strong>{{ 'reviews.zone.' + z | transloco }}</strong>{{ last ? '' : ', ' }}}
              </p>
            }
          </div>
        } @else {
          <p class="text-sm text-[var(--muted)]">{{ 'reviews.empty' | transloco }}</p>
        }
      }

      @if (garment().fabricNotes; as notes) {
        <p class="text-sm"><span class="eyebrow block mb-1">{{ 'reviews.fabric' | transloco }}</span>{{ notes | transloco }}</p>
      }

      <ul class="space-y-3">
        @for (r of reviews(); track r.id) {
          <li class="border-t border-[var(--line)] pt-3 text-sm">
            <p class="font-medium">{{ 'reviews.feeling.' + r.feeling | transloco }} · {{ 'reviews.bought' | transloco: { size: r.sizeBought } }}</p>
            @if (r.zones.length) {
              <p class="text-xs text-[var(--muted)]">
                @for (z of r.zones; track z; let last = $last) {{{ 'reviews.zone.' + z | transloco }}{{ last ? '' : ' · ' }}}
              </p>
            }
            @if (r.comment) {<p class="mt-1 text-[var(--ink-2)]">“{{ r.comment }}”</p>}
          </li>
        }
      </ul>

      <details>
        <summary class="cursor-pointer text-sm font-medium">{{ 'reviews.write' | transloco }}</summary>
        <form class="mt-3 space-y-3" (ngSubmit)="submit()">
          <label class="field">{{ 'reviews.sizeBought' | transloco }}
            <select name="size" [(ngModel)]="size" required>
              @for (e of garment().sizeChart; track e.size) {<option [value]="e.size">{{ e.size }}</option>}
            </select>
          </label>
          <div class="flex flex-wrap gap-2" role="radiogroup" [attr.aria-label]="'reviews.howFit' | transloco">
            @for (f of feelings; track f) {
              <button type="button" class="chip" role="radio" [attr.aria-checked]="feeling() === f" [attr.aria-pressed]="feeling() === f" (click)="feeling.set(f)">{{ 'reviews.feeling.' + f | transloco }}</button>
            }
          </div>
          <div class="flex flex-wrap gap-2" [attr.aria-label]="'reviews.whereLabel' | transloco">
            @for (z of zones; track z) {
              <button type="button" class="chip" [attr.aria-pressed]="picked().includes(z)" (click)="toggleZone(z)">{{ 'reviews.zone.' + z | transloco }}</button>
            }
          </div>
          <label class="field">{{ 'reviews.comment' | transloco }}
            <textarea name="comment" rows="2" maxlength="500" [(ngModel)]="comment"></textarea>
          </label>
          <button type="submit" class="btn btn-primary" [disabled]="!size || sending()">{{ 'reviews.send' | transloco }}</button>
          @if (sent()) {<p class="text-sm text-[var(--conf-high)]" role="status">{{ 'reviews.thanks' | transloco }}</p>}
        </form>
      </details>
    </section>
  `,
})
export class ReviewsPanelComponent {
  private readonly api = inject(ApiService);
  private readonly notices = inject(NoticeStore);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly garment = input.required<GarmentItem>();

  readonly reviews = signal<FitReview[]>([]);
  readonly summary = signal<FitReviewSummary | null>(null);
  readonly feelings: FitFeeling[] = ['runs-small', 'true-to-size', 'runs-large'];
  readonly zones: FitZone[] = ['shoulders', 'chest', 'waist', 'hips', 'length', 'sleeves'];
  readonly feeling = signal<FitFeeling>('true-to-size');
  readonly picked = signal<FitZone[]>([]);
  readonly sending = signal(false);
  readonly sent = signal(false);
  size = '';
  comment = '';

  private readonly total = computed(() => this.summary()?.total || 1);

  constructor() {
    effect(() => void this.load(this.garment().id));
  }

  async load(garmentId = this.garment().id) {
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      this.apply(await this.api.reviews(garmentId));
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  pct(n: number) {
    return (n / this.total()) * 100;
  }

  toggleZone(z: FitZone) {
    this.picked.update((p) => (p.includes(z) ? p.filter((x) => x !== z) : [...p, z]));
  }

  async submit() {
    this.sending.set(true);
    try {
      const r = await this.api.createReview({
        garmentId: this.garment().id,
        sizeBought: this.size,
        feeling: this.feeling(),
        zones: this.feeling() === 'true-to-size' ? [] : this.picked(),
        comment: this.comment.trim() || undefined,
      });
      this.apply(r);
      this.sent.set(true);
      this.comment = '';
      this.picked.set([]);
    } catch (err) {
      this.notices.error(err, 'errors.reviewSubmit');
    } finally {
      this.sending.set(false);
    }
  }

  private apply(r: { reviews: FitReview[]; summary: FitReviewSummary }) {
    this.reviews.set(r.reviews);
    this.summary.set(r.summary);
  }
}
