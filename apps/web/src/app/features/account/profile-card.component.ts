import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ProfileMeasure, SavedProfile } from '@vestirse/shared-types';
import { NoticeStore } from '../../core/notice.store';
import { ProfileStore, type ProfileValues } from '../../core/profile.store';

type Field = 'heightCm' | 'weightKg' | ProfileMeasure;

const FIELDS: { key: Field; label: string; min: number; max: number }[] = [
  { key: 'heightCm', label: 'fit.height', min: 120, max: 230 },
  { key: 'weightKg', label: 'profile.weight', min: 30, max: 250 },
  { key: 'chestCm', label: 'fit.chest', min: 50, max: 200 },
  { key: 'waistCm', label: 'fit.waist', min: 40, max: 200 },
  { key: 'hipCm', label: 'fit.hip', min: 50, max: 200 },
  { key: 'shoulderCm', label: 'measure.shoulder', min: 25, max: 70 },
];

/**
 * «Mi perfil»: foto y medidas guardadas en la cuenta, solo con consentimiento explícito.
 * Cada cambio llega al instante a la talla, la cámara y la prueba con foto (ProfileStore).
 */
@Component({
  selector: 'app-profile-card',
  imports: [FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card space-y-4 p-5">
      <header>
        <h2 class="text-lg">{{ 'profile.title' | transloco }}</h2>
        <p class="mt-1 text-sm text-ink-2">{{ 'profile.lead' | transloco }}</p>
      </header>

      @if (store.profile(); as p) {
        <div class="flex items-start gap-4">
          @if (store.photoUrl(); as url) {
            <img [src]="url" [alt]="'profile.photoAlt' | transloco" class="h-36 w-24 shrink-0 bg-surface-2 object-cover" />
          } @else {
            <div class="grid h-36 w-24 shrink-0 place-items-center bg-surface-2 p-2 text-center text-[11px] text-muted">{{ 'profile.noPhoto' | transloco }}</div>
          }
          <div class="min-w-0 space-y-2 text-sm">
            <label class="btn cursor-pointer">
              {{ (p.hasPhoto ? 'profile.changePhoto' : 'profile.addPhoto') | transloco }}
              <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" (change)="onPhoto($event)" [disabled]="store.busy()" />
            </label>
            @if (p.hasPhoto) {
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn" (click)="remeasure()" [disabled]="store.busy()">{{ 'profile.measureAi' | transloco }}</button>
                <button type="button" class="btn btn-ghost" (click)="deletePhoto()" [disabled]="store.busy()">{{ 'profile.deletePhoto' | transloco }}</button>
              </div>
            }
            <p class="text-[12px] text-muted">{{ 'profile.photoNote' | transloco }}</p>
          </div>
        </div>
        @if (store.lastPhoto(); as last) {
          <div class="border border-line p-3 text-[13px]" role="status">
            @if (last.photoCheck && !last.photoCheck.ok && last.photoCheck.reason) {
              <p>{{ 'photo.check.' + last.photoCheck.reason | transloco }}</p>
            }
            @if (last.estimate.usable) {
              <p>{{ 'profile.aiApplied' | transloco }}</p>
            } @else if (last.estimate.checked) {
              <p>{{ 'measure.reason.' + (last.estimate.reason ?? 'unknown') | transloco }}</p>
            } @else {
              <p>{{ 'measure.unavailable' | transloco }}</p>
            }
          </div>
        }
      }

      <form class="space-y-3" (ngSubmit)="save()">
        <div class="grid grid-cols-2 gap-3">
          @for (f of fields; track f.key) {
            <label class="field">
              <span>
                {{ f.label | transloco }} <span class="text-muted">({{ f.key === 'weightKg' ? 'kg' : 'cm' }})</span>
                @if (isAi(f.key)) {<span class="ml-1 border border-line px-1 text-[10px] uppercase tracking-[0.08em]" [title]="'profile.aiBadgeHelp' | transloco">{{ 'profile.aiBadge' | transloco }}</span>}
              </span>
              <input type="number" inputmode="numeric" [name]="f.key" [min]="f.min" [max]="f.max" [required]="f.key === 'heightCm'" [ngModel]="values()[f.key]" (ngModelChange)="set(f.key, $event)" />
            </label>
          }
        </div>
        @if (!store.profile()) {
          <label class="flex items-start gap-3 border-y border-line py-3 text-sm">
            <input type="checkbox" class="mt-1 size-5" name="consent" [checked]="consent()" (change)="consent.set(!consent())" />
            <span>{{ 'profile.consent' | transloco }}</span>
          </label>
        }
        @if (error()) {<p class="text-sm text-danger" role="alert">{{ error()! | transloco }}</p>}
        <button type="submit" class="btn btn-primary" [disabled]="store.busy() || (!store.profile() && !consent())">{{ (store.profile() ? 'profile.save' : 'profile.create') | transloco }}</button>
      </form>

      @if (store.profile()) {
        <div class="border-t border-line pt-4">
          @if (!confirmRemove()) {
            <button type="button" class="text-[12px] text-ink-2 underline-offset-4 hover:underline" (click)="confirmRemove.set(true)">{{ 'profile.withdraw' | transloco }}</button>
          } @else {
            <p class="text-sm">{{ 'profile.withdrawBody' | transloco }}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button type="button" class="btn btn-primary" (click)="remove()">{{ 'profile.withdrawConfirm' | transloco }}</button>
              <button type="button" class="btn btn-ghost" (click)="confirmRemove.set(false)">{{ 'common.cancel' | transloco }}</button>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ProfileCardComponent {
  readonly store = inject(ProfileStore);
  private readonly notices = inject(NoticeStore);
  readonly fields = FIELDS;
  readonly values = signal<Partial<Record<Field, number | null>>>({});
  readonly consent = signal(false);
  readonly confirmRemove = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    // El formulario refleja el perfil guardado (también cuando la IA rellena medidas).
    effect(() => {
      const p = this.store.profile();
      untracked(() => this.values.set(p ? pick(p) : {}));
    });
  }

  isAi(key: Field): boolean {
    return key !== 'heightCm' && key !== 'weightKg' && !!this.store.profile()?.aiFields.includes(key);
  }

  set(key: Field, value: number | string | null) {
    const n = value === '' || value === null ? null : Number(value);
    this.values.update((v) => ({ ...v, [key]: n }));
  }

  async save() {
    const v = this.values();
    const out = FIELDS.find((f) => {
      const n = v[f.key];
      return (f.key === 'heightCm' && !n) || (n != null && (n < f.min || n > f.max));
    });
    if (out) {
      this.error.set(out.key === 'heightCm' ? 'fit.error.height' : 'profile.error.range');
      return;
    }
    this.error.set(null);
    const body: ProfileValues = { heightCm: v.heightCm! };
    for (const f of FIELDS) if (f.key !== 'heightCm' && v[f.key] != null) body[f.key] = v[f.key]!;
    try {
      await this.store.save(body);
      this.notices.success('profile.saved');
    } catch (err) {
      this.notices.error(err, 'errors.profile');
    }
  }

  async onPhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      this.notices.info('photo.error.tooBig');
      return;
    }
    try {
      await this.store.setPhoto(file);
    } catch (err) {
      this.notices.error(err, 'errors.profile');
    }
  }

  async remeasure() {
    try {
      await this.store.remeasure();
    } catch (err) {
      this.notices.error(err, 'errors.measure');
    }
  }

  async deletePhoto() {
    try {
      await this.store.deletePhoto();
      this.notices.success('photo.deleted');
    } catch (err) {
      this.notices.error(err, 'errors.profile');
    }
  }

  async remove() {
    try {
      await this.store.remove();
      this.confirmRemove.set(false);
      this.consent.set(false);
      this.notices.success('profile.withdrawn');
    } catch (err) {
      this.notices.error(err, 'errors.profile');
    }
  }
}

function pick(p: SavedProfile): Partial<Record<Field, number | null>> {
  return Object.fromEntries(FIELDS.map((f) => [f.key, p[f.key] ?? null]));
}
