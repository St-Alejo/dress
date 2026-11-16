import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AI_DRESSING_ORDER, type GarmentItem, type OutfitItem, type TryOnSession } from '@vestirse/shared-types';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { NoticeStore } from '../../core/notice.store';
import { ProfileStore } from '../../core/profile.store';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import { IconComponent } from '../../shared/ui/icon.component';

const POLL_MS = 3000;
const POLL_LIMIT_MS = 6 * 60_000;
/** Lo que la IA de imagen acepta en una edición (una prenda por zona: arriba, abajo, abrigo, calzado, accesorio). */
export const MAX_AI_PIECES = 5;

/** Las prendas marcadas, de dentro hacia fuera (como se visten), hasta el máximo de una edición. */
export function aiPieces(garments: GarmentItem[], excluded: ReadonlySet<string>): GarmentItem[] {
  return garments
    .filter((g) => !excluded.has(g.id))
    .sort((a, b) => AI_DRESSING_ORDER[a.category] - AI_DRESSING_ORDER[b.category])
    .slice(0, MAX_AI_PIECES);
}

export type AiPhotoSource = 'profile' | 'model' | 'file';
type State = 'idle' | 'working' | 'done' | 'failed';

/**
 * Prueba con IA de imagen (ChatGPT): la foto de la persona y las prendas elegidas, una sola o el look entero,
 * cada una en la talla elegida o en la recomendada para su perfil. La API manda también sus medidas
 * guardadas para que la ropa caiga como en ese cuerpo. Se usa en «Armar look» y en la bolsa.
 */
@Component({
  selector: 'app-ai-outfit',
  imports: [RouterLink, TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4">
      @if (state() === 'done' && result()) {
        <div class="stage relative h-[min(72vh,680px)] overflow-hidden">
          <img [src]="result()" [alt]="'aiLook.resultAlt' | transloco" class="absolute inset-0 h-full w-full object-contain" />
          <p class="badge mono">{{ 'aiLook.badge' | transloco }}</p>
        </div>
        <p class="text-[12px] text-muted">{{ triedSummary() }}</p>
        <div class="flex flex-wrap gap-3">
          @if (auth.user()) {
            @if (savedFavorite()) {
              <a routerLink="/favoritos" class="btn btn-primary"><ui-icon name="heart" [size]="16" /> {{ 'cart.ai.savedFavorite' | transloco }}</a>
            } @else {
              <button type="button" class="btn btn-primary" (click)="saveFavorite()" [disabled]="savingFavorite()">
                <ui-icon name="heart" [size]="16" /> {{ 'cart.ai.saveFavorite' | transloco }}
              </button>
            }
          }
          <button type="button" class="btn" (click)="reset()">{{ 'aiLook.again' | transloco }}</button>
          <button type="button" class="btn" (click)="deletePhoto()">{{ 'photo.delete' | transloco }}</button>
        </div>
      } @else if (state() === 'working') {
        <div class="stage relative grid h-[min(72vh,680px)] place-items-center overflow-hidden p-8 text-center" role="status" aria-live="polite">
          <div class="max-w-sm">
            <div class="ai-pulse mx-auto h-16 w-16 rounded-full bg-ink"></div>
            <p class="mt-6 text-[15px]">{{ 'aiLook.working' | transloco: { count: picked().length } }}</p>
            <p class="mt-2 text-[12px] text-muted">{{ 'aiLook.workingHint' | transloco }}</p>
          </div>
        </div>
      } @else {
        @if (state() === 'failed') {
          <p class="border border-line p-4 text-[13px]" role="alert">{{ 'aiLook.failed' | transloco }}</p>
        }
        @if (!garments().length) {
          <p class="border border-line p-6 text-center text-[13px] text-ink-2">{{ 'aiLook.nothing' | transloco }}</p>
        } @else {
          <p class="text-[13px] text-ink-2">{{ 'aiLook.lead' | transloco }}</p>
          <ul class="divide-y divide-line border-y border-line">
            @for (g of garments(); track g.id) {
              <li class="flex flex-wrap items-center gap-3 py-3">
                <label class="flex min-w-0 flex-1 items-center gap-3 text-[13px]">
                  <input type="checkbox" [checked]="!excluded().has(g.id)" (change)="toggle(g.id)" [attr.aria-label]="g.name" />
                  <img [src]="g.images.thumb ?? g.images.photo" alt="" class="h-14 w-11 shrink-0 bg-surface-2 object-cover" />
                  <span class="truncate">{{ g.name }}</span>
                </label>
                @if (g.sizeChart.length) {
                  <label class="text-[12px] text-ink-2">
                    {{ 'cart.size' | transloco }}
                    <select class="ml-1 border border-line bg-paper px-2 py-1" (change)="setSize(g.id, $event)" [disabled]="excluded().has(g.id)">
                      <option value="" [selected]="!chosenSizes()[g.id]">
                        {{ recommended()[g.id] ? ('aiLook.sizeRecommended' | transloco: { size: recommended()[g.id] }) : ('aiLook.sizeAuto' | transloco) }}
                      </option>
                      @for (s of g.sizeChart; track s.size) {
                        <option [value]="s.size" [selected]="chosenSizes()[g.id] === s.size">{{ s.size }}</option>
                      }
                    </select>
                  </label>
                }
              </li>
            }
          </ul>
          @if (tooMany()) {
            <p class="text-[12px] text-muted">{{ 'aiLook.tooMany' | transloco: { max: max } }}</p>
          }

          <fieldset class="space-y-3">
            <legend class="label-xs">{{ 'cart.ai.photo' | transloco }}</legend>
            @if (profile.photoUrl(); as url) {
              <label class="flex items-center gap-3 text-[13px]">
                <input type="radio" name="ai-look-photo" [checked]="source() === 'profile'" (change)="source.set('profile')" />
                <img [src]="url" alt="" class="h-16 w-12 bg-surface-2 object-cover" />
                {{ 'aiLook.useProfile' | transloco }}
              </label>
            }
            @if (tryon.selectedBody(); as b) {
              <label class="flex items-center gap-3 text-[13px]">
                <input type="radio" name="ai-look-photo" [checked]="source() === 'model'" (change)="source.set('model')" />
                <img [src]="b.photoUrl" alt="" class="h-16 w-12 bg-surface-2 object-contain" />
                {{ 'aiLook.useModel' | transloco }}
              </label>
            }
            <label class="flex flex-wrap items-center gap-3 text-[13px]">
              <input type="radio" name="ai-look-photo" [checked]="source() === 'file'" (change)="source.set('file')" />
              {{ 'cart.ai.useFile' | transloco }}
              <input type="file" accept="image/jpeg,image/png,image/webp" class="text-[12px]" (change)="pickFile($event)" />
            </label>
            @if (source() === 'file') {
              <label class="flex items-start gap-2 text-[12px] text-ink-2">
                <input type="checkbox" class="mt-0.5" [checked]="ack()" (change)="ack.set(!ack())" />
                {{ 'cart.ai.privacy' | transloco }}
              </label>
            }
            @if (!profile.profile() && auth.user()) {
              <p class="text-[12px] text-muted"><a routerLink="/cuenta" class="underline underline-offset-4">{{ 'aiLook.profileHint' | transloco }}</a></p>
            }
          </fieldset>

          <button type="button" class="btn btn-primary w-full justify-center" [disabled]="!canGenerate()" (click)="generate()">
            <ui-icon name="sparkle" [size]="16" />
            {{ (picked().length === garments().length && picked().length > 1 ? 'aiLook.generateAll' : 'aiLook.generateSome') | transloco: { count: picked().length } }}
          </button>
          <p class="text-[12px] text-muted">{{ 'aiLook.note' | transloco }}</p>
        }
      }
    </div>
  `,
  styles: `
    .ai-pulse { animation: ai-pulse 1.6s ease-in-out infinite; }
    @keyframes ai-pulse { 0%, 100% { transform: scale(0.7); opacity: 0.35; } 50% { transform: scale(1); opacity: 0.9; } }
    @media (prefers-reduced-motion: reduce) { .ai-pulse { animation: none; opacity: 0.6; } }
  `,
})
export class AiOutfitComponent {
  /** Prendas del look o de la bolsa (una por zona). */
  readonly garments = input.required<GarmentItem[]>();
  /** Tallas ya elegidas (p. ej. en la bolsa); las demás van con la recomendada. */
  readonly sizes = input<Record<string, string>>({});

  private readonly api = inject(ApiService);
  private readonly notices = inject(NoticeStore);
  readonly auth = inject(AuthStore);
  readonly profile = inject(ProfileStore);
  readonly tryon = inject(TryOnSessionStore);
  readonly max = MAX_AI_PIECES;

  readonly excluded = signal<ReadonlySet<string>>(new Set());
  readonly chosenSizes = signal<Record<string, string>>({});
  readonly recommended = signal<Record<string, string>>({});
  readonly source = signal<AiPhotoSource>('file');
  readonly file = signal<File | null>(null);
  readonly ack = signal(false);
  readonly state = signal<State>('idle');
  readonly result = signal<string | null>(null);
  readonly savingFavorite = signal(false);
  readonly savedFavorite = signal(false);
  private session: TryOnSession | null = null;
  private tried: GarmentItem[] = [];
  private stopPolling = false;

  /** Las prendas marcadas, de dentro hacia fuera, hasta el máximo de una edición. */
  readonly picked = computed(() => aiPieces(this.garments(), this.excluded()));
  readonly tooMany = computed(() => this.garments().filter((g) => !this.excluded().has(g.id)).length > MAX_AI_PIECES);
  readonly photoReady = computed(() => {
    switch (this.source()) {
      case 'profile':
        return !!this.profile.photoUrl();
      case 'model':
        return !!this.tryon.selectedBody();
      default:
        return !!this.file() && this.ack();
    }
  });
  readonly canGenerate = computed(() => this.picked().length > 0 && this.photoReady() && this.state() !== 'working');
  readonly triedSummary = computed(() => {
    this.result();
    return this.tried.map((g) => `${g.name} · ${this.sizeLabel(g)}`).join(' — ');
  });

  constructor() {
    // Foto por defecto: la del perfil; si no hay, la del modelo elegido; si no, subir una.
    effect(() => {
      const fromProfile = !!this.profile.photoUrl();
      const fromModel = !!this.tryon.selectedBody();
      untracked(() => {
        if (this.file()) return;
        this.source.set(fromProfile ? 'profile' : fromModel ? 'model' : 'file');
      });
    });
    effect(() => {
      const initial = this.sizes();
      untracked(() => this.chosenSizes.set({ ...initial }));
    });
    // Talla recomendada para las medidas de la persona (perfil o las que escribió en la ficha).
    effect(() => {
      const m = this.tryon.measurements();
      const garments = this.garments();
      if (!m?.heightCm) return;
      untracked(() => {
        for (const g of garments) {
          if (!g.sizeChart.length || this.recommended()[g.id]) continue;
          this.api
            .estimateFit({ garmentId: g.id, measurements: m })
            .then((rec) => this.recommended.update((r) => ({ ...r, [g.id]: rec.userOverride ?? rec.recommendedSize })))
            .catch(() => undefined);
        }
      });
    });
    inject(DestroyRef).onDestroy(() => (this.stopPolling = true));
  }

  toggle(id: string) {
    this.excluded.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  setSize(id: string, event: Event) {
    const size = (event.target as HTMLSelectElement).value;
    this.chosenSizes.update((s) => ({ ...s, [id]: size }));
  }

  pickFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(file);
    if (file) this.source.set('file');
  }

  private sizeLabel(g: GarmentItem): string {
    return this.chosenSizes()[g.id] || this.recommended()[g.id] || '—';
  }

  private async photo(): Promise<Blob> {
    if (this.source() === 'profile') return this.profile.photoBlob();
    if (this.source() === 'model') {
      const res = await fetch(this.tryon.selectedBody()!.photoUrl);
      if (!res.ok) throw new Error('model photo');
      return res.blob();
    }
    return this.file()!;
  }

  async generate() {
    if (!this.canGenerate()) return;
    const garments = this.picked();
    this.tried = garments;
    this.state.set('working');
    this.result.set(null);
    this.savedFavorite.set(false);
    try {
      const photo = await this.photo();
      // Talla vacía = la recomendada para el perfil (la decide la API con las medidas guardadas).
      const outfit: OutfitItem[] = garments.map((g) => ({ garmentId: g.id, size: this.chosenSizes()[g.id] || this.recommended()[g.id] || '' }));
      const started = await this.api.startSession({ garmentId: garments[0]!.id, mode: 'photorealistic', outfit, bodyModelId: this.source() === 'model' ? this.tryon.selectedBody()?.id : undefined });
      this.session = await this.api.uploadPhoto(started.id, photo);
      this.session = await this.api.generate(started.id);
      await this.poll(started.id);
    } catch (err) {
      this.state.set('failed');
      this.notices.error(err, 'errors.generate');
    }
  }

  private async poll(id: string) {
    const deadline = Date.now() + POLL_LIMIT_MS;
    while (!this.stopPolling && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const s = await this.api.session(id).catch(() => null);
      if (!s) continue;
      this.session = s;
      if (s.generationStatus === 'done' && s.resultImageUrl) {
        this.result.set(s.resultImageUrl);
        this.state.set('done');
        return;
      }
      if (s.generationStatus === 'failed' || s.generationStatus === 'fallback') {
        this.state.set('failed');
        return;
      }
    }
    if (!this.stopPolling) this.state.set('failed');
  }

  async saveFavorite() {
    if (!this.session) return;
    this.savingFavorite.set(true);
    try {
      await this.api.saveFavorite({ sessionId: this.session.id });
      this.savedFavorite.set(true);
    } catch (err) {
      this.notices.error(err, 'errors.saveResult');
    } finally {
      this.savingFavorite.set(false);
    }
  }

  reset() {
    this.savedFavorite.set(false);
    this.state.set('idle');
    this.result.set(null);
  }

  async deletePhoto() {
    const s = this.session;
    if (!s) return;
    try {
      await this.api.deletePhoto(s.id);
      this.session = null;
      this.reset();
      this.notices.success('photo.deleted');
    } catch (err) {
      this.notices.error(err, 'errors.deletePhoto');
    }
  }
}
