import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AI_DRESSING_ORDER, AI_WEARABLE, type GarmentItem, type TryOnSession } from '@vestirse/shared-types';
import { ApiService } from '../../core/api.service';
import { AuthStore } from '../../core/auth.store';
import { CartStore, defaultOutfit, toggleWorn } from '../../core/cart.store';
import { NoticeStore } from '../../core/notice.store';
import { ProfileStore } from '../../core/profile.store';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import { PricePipe } from '../../shared/price.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { TabsComponent, type TabItem } from '../../shared/ui/tabs.component';
import { ApproxViewComponent } from '../catalog/approx-view.component';
import { BodyPickerComponent } from '../catalog/body-picker.component';
import { LiveTryOnComponent } from '../live-overlay/live-tryon.component';
import { canWear } from '../live-overlay/engine/tryon-scene';
import { canOverlay } from '../live-overlay/overlay-geometry';
import { LOOK_SLOTS, slotOf } from '../look/pairing';

type Stage = 'model' | 'camera' | 'ai';
type AiState = 'idle' | 'working' | 'done' | 'failed';

const POLL_MS = 3000;
const POLL_LIMIT_MS = 12 * 60_000;

interface Line {
  index: number;
  garment: GarmentItem;
  size: string | null;
}

/**
 * Carrito con probador: se puede comprar dos camisas, pero el probador viste una prenda por
 * zona (otra camisa sustituye a la anterior; un vestido ocupa camisa y pantalón). Tres vistas:
 * al instante sobre un modelo, en la cámara (no sale del dispositivo) y una versión realista con
 * IA, que viste la foto prenda por prenda (zapatos y accesorios solo en las vistas instantáneas).
 */
@Component({
  selector: 'app-cart-page',
  imports: [RouterLink, TranslocoPipe, PricePipe, IconComponent, SkeletonComponent, TabsComponent, ApproxViewComponent, BodyPickerComponent, LiveTryOnComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .stage {
      background: #f6f5f2;
    }
  `,
  template: `
    <section class="mx-auto max-w-screen-2xl px-4 pt-8 pb-16 md:px-8">
      <header class="max-w-2xl">
        <h1 class="text-[28px] md:text-[40px]">{{ 'cart.title' | transloco }}</h1>
        <p class="mt-3 max-w-xl text-[14px] text-ink-2">{{ 'cart.lead' | transloco }}</p>
      </header>

      @if (loading()) {
        <p class="sr-only" role="status">{{ 'common.loading' | transloco }}</p>
        <div class="mt-8 grid gap-8 lg:grid-cols-2" aria-hidden="true"><ui-skeleton class="h-[min(70vh,640px)]" /><ui-skeleton class="h-96" /></div>
      } @else if (error()) {
        <div class="mt-8 border border-line p-8 text-center" role="alert">
          <p>{{ 'common.loadError' | transloco }}</p>
          <button type="button" class="btn mt-4" (click)="load()">{{ 'common.retry' | transloco }}</button>
        </div>
      } @else if (!lines().length) {
        <div class="mt-8 border border-line p-10 text-center">
          <p class="text-[15px]">{{ 'cart.empty' | transloco }}</p>
          <a routerLink="/tienda" class="btn btn-primary mt-5">{{ 'cart.browse' | transloco }}</a>
        </div>
      } @else {
        <div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
          <section class="min-w-0 space-y-4" [attr.aria-label]="'cart.fittingRoom' | transloco">
            <h2 class="label-xs">{{ 'cart.fittingRoom' | transloco }}</h2>
            <ui-tabs #tabs [items]="stageTabs()" [(active)]="stage" [label]="'cart.fittingRoom' | transloco" [stretch]="true" />
            <div role="tabpanel" [id]="tabs.panelId(stage())" [attr.aria-labelledby]="tabs.tabId(stage())">
              @switch (stage()) {
                @case ('model') {
                  <div class="stage relative h-[min(70vh,640px)] overflow-hidden">
                    @if (session.selectedBody(); as b) {
                      @if (b.pose && dressable().length) {
                        <app-approx-view class="block h-full" [body]="b" [garments]="dressable()" />
                        <p class="absolute right-3 top-3 bg-paper/90 px-2 py-1 text-[11px] text-ink-2">{{ 'body.approxPreview' | transloco }}</p>
                      } @else {
                        <img [src]="b.photoUrl" alt="" class="absolute inset-0 h-full w-full object-contain" />
                      }
                    } @else {
                      <p class="absolute inset-0 grid place-items-center p-8 text-center text-[13px] text-ink-2">{{ 'body.chooseToSee' | transloco }}</p>
                    }
                  </div>
                  <div class="mt-4"><app-body-picker /></div>
                }
                @case ('camera') {
                  @if (cameraGarment(); as g) {
                    <app-live-tryon [garment]="g" [outfit]="dressable()" [realistic]="false" [sizePicker]="false" />
                  } @else {
                    <p class="border border-line p-8 text-center text-[13px] text-ink-2">{{ 'look.cameraEmpty' | transloco }}</p>
                  }
                }
                @case ('ai') {
                  <div class="space-y-4">
                    @if (aiState() === 'done' && aiResult()) {
                      <div class="stage relative h-[min(70vh,640px)] overflow-hidden">
                        <img [src]="aiResult()" [alt]="'cart.ai.resultAlt' | transloco" class="absolute inset-0 h-full w-full object-contain" />
                      </div>
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
                        <button type="button" class="btn" (click)="resetAi()">{{ 'cart.ai.again' | transloco }}</button>
                        <button type="button" class="btn" (click)="deleteAiPhoto()">{{ 'photo.delete' | transloco }}</button>
                      </div>
                    } @else if (aiState() === 'working') {
                      <div class="border border-line p-8 text-center" role="status" aria-live="polite">
                        <p class="text-[14px]">{{ 'cart.ai.working' | transloco: { step: aiStep(), total: aiGarments().length } }}</p>
                        <p class="mt-2 text-[12px] text-muted">{{ 'cart.ai.workingHint' | transloco }}</p>
                      </div>
                    } @else {
                      @if (aiState() === 'failed') {
                        <p class="border border-line p-4 text-[13px]" role="alert">{{ 'cart.ai.failed' | transloco }}</p>
                      }
                      @if (aiGarments().length) {
                        <p class="text-[13px] text-ink-2">{{ 'cart.ai.lead' | transloco: { count: aiGarments().length } }}</p>
                        <ul class="flex flex-wrap gap-2 text-[12px]">
                          @for (g of aiGarments(); track g.id) {
                            <li class="border border-line px-2 py-1">{{ g.name }} · {{ sizeFor(g) }}</li>
                          }
                          @for (g of aiShoes(); track g.id) {
                            <li class="border border-line px-2 py-1">{{ g.name }} · {{ sizeFor(g) }}</li>
                          }
                        </ul>
                      } @else {
                        <p class="border border-line p-6 text-center text-[13px] text-ink-2">{{ 'cart.ai.nothing' | transloco }}</p>
                      }
                      @if (aiGarments().length) {
                        <p class="text-[12px] text-muted">{{ 'cart.ai.finishNote' | transloco }}</p>
                      }
                      @if (onlyInstant().length) {
                        <p class="text-[12px] text-muted">{{ 'cart.ai.instantOnly' | transloco }}</p>
                      }

                      <fieldset class="space-y-3 border-t border-line pt-4" [disabled]="!aiGarments().length">
                        <legend class="label-xs">{{ 'cart.ai.photo' | transloco }}</legend>
                        @if (profile.photoUrl(); as url) {
                          <label class="flex items-center gap-3 text-[13px]">
                            <input type="radio" name="ai-photo" [checked]="photoSource() === 'profile'" (change)="photoSource.set('profile')" />
                            <img [src]="url" alt="" class="h-16 w-12 bg-surface-2 object-cover" />
                            {{ 'cart.ai.useProfile' | transloco }}
                          </label>
                        }
                        <label class="flex flex-wrap items-center gap-3 text-[13px]">
                          <input type="radio" name="ai-photo" [checked]="photoSource() === 'file'" (change)="photoSource.set('file')" />
                          {{ 'cart.ai.useFile' | transloco }}
                          <input type="file" accept="image/jpeg,image/png,image/webp" class="text-[12px]" (change)="pickFile($event)" />
                        </label>
                        @if (photoSource() === 'file') {
                          <label class="flex items-start gap-2 text-[12px] text-ink-2">
                            <input type="checkbox" class="mt-0.5" [checked]="ack()" (change)="ack.set(!ack())" />
                            {{ 'cart.ai.privacy' | transloco }}
                          </label>
                        }
                        <button type="button" class="btn btn-primary" [disabled]="!canGenerate()" (click)="generate()">{{ 'cart.ai.generate' | transloco }}</button>
                      </fieldset>
                    }
                  </div>
                }
              }
            </div>
            <p class="text-[12px] text-muted" aria-live="polite">{{ wornSummary() }}</p>
          </section>

          <section class="min-w-0" [attr.aria-label]="'cart.items' | transloco">
            <h2 class="label-xs">{{ 'cart.items' | transloco }} ({{ lines().length }})</h2>
            <ul class="mt-3">
              @for (line of lines(); track line.index) {
                <li class="flex gap-3 border-b border-line py-4">
                  <img [src]="line.garment.images.thumb ?? line.garment.images.photo" alt="" class="h-24 w-[72px] shrink-0 bg-surface-2 object-cover" />
                  <div class="min-w-0 flex-1">
                    <a [routerLink]="['/prenda', line.garment.id]" class="block truncate text-[14px] hover:underline">{{ line.garment.name }}</a>
                    <p class="text-[12px] text-muted">{{ line.garment.brandName }} · {{ 'look.slot.' + slotOf(line.garment.category) | transloco }} · <span class="tabular">{{ line.garment.priceCents | price }}</span></p>
                    <div class="mt-2 flex flex-wrap items-center gap-3">
                      <label class="text-[12px] text-ink-2">
                        {{ 'cart.size' | transloco }}
                        <select class="ml-1 border border-line bg-paper px-2 py-1" (change)="setSize(line.index, $event)">
                          @if (!line.size) { <option value="" disabled>—</option> }
                          @for (s of line.garment.sizeChart; track s.size) {
                            <option [value]="s.size" [selected]="s.size === line.size">{{ s.size }}</option>
                          }
                        </select>
                      </label>
                      <button type="button" class="btn !min-h-9 !px-3 text-[12px]" [class.btn-primary]="isWorn(line.garment)" [attr.aria-pressed]="isWorn(line.garment)" (click)="toggle(line.garment)">
                        {{ (isWorn(line.garment) ? 'cart.wearing' : 'cart.tryOn') | transloco }}
                      </button>
                      <button type="button" class="text-[12px] text-ink-2 underline-offset-4 hover:underline" (click)="remove(line)">{{ 'look.remove' | transloco }}</button>
                    </div>
                  </div>
                </li>
              }
            </ul>
            <div class="flex flex-wrap items-center gap-3 py-5">
              <p class="mr-auto text-[15px]">{{ 'look.total' | transloco }} <span class="tabular">{{ total() | price }}</span></p>
              <button type="button" class="text-[12px] text-ink-2 underline-offset-4 hover:underline" (click)="cart.clear()">{{ 'cart.clear' | transloco }}</button>
            </div>
            <p class="text-[12px] text-muted"><ui-icon name="info" [size]="14" /> {{ 'cart.oneBySlot' | transloco }}</p>
          </section>
        </div>
      }
    </section>
  `,
})
export class CartPage {
  private readonly api = inject(ApiService);
  private readonly notices = inject(NoticeStore);
  private readonly transloco = inject(TranslocoService);
  private readonly dictionary = toSignal(this.transloco.selectTranslation());
  readonly cart = inject(CartStore);
  readonly session = inject(TryOnSessionStore);
  readonly profile = inject(ProfileStore);
  readonly auth = inject(AuthStore);
  readonly savingFavorite = signal(false);
  readonly savedFavorite = signal(false);

  readonly slotOf = slotOf;
  readonly catalog = signal<GarmentItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly stage = signal<Stage>('model');
  /** Lo que lleva puesto el probador (ids), una prenda por zona. */
  readonly wornIds = signal<string[] | null>(null);

  readonly photoSource = signal<'profile' | 'file'>('file');
  readonly file = signal<Blob | null>(null);
  readonly ack = signal(false);
  readonly aiState = signal<AiState>('idle');
  readonly aiStep = signal(1);
  readonly aiResult = signal<string | null>(null);
  private aiSession: TryOnSession | null = null;
  private stopPolling = false;

  readonly stageTabs = computed<TabItem<Stage>[]>(() => {
    this.dictionary();
    return (['model', 'camera', 'ai'] as const).map((s) => ({ id: s, label: this.transloco.translate('cart.stage.' + s) }));
  });

  readonly lines = computed<Line[]>(() => {
    const byId = new Map(this.catalog().map((g) => [g.id, g]));
    return this.cart.items().flatMap((item, index) => {
      const garment = byId.get(item.garmentId);
      return garment ? [{ index, garment, size: item.size }] : [];
    });
  });
  readonly total = computed(() => this.lines().reduce((s, l) => s + l.garment.priceCents, 0));

  readonly worn = computed(() => {
    const garments = unique(this.lines().map((l) => l.garment));
    const ids = this.wornIds();
    if (ids === null) return defaultOutfit(garments);
    return ids.map((id) => garments.find((g) => g.id === id)).filter((g): g is GarmentItem => !!g);
  });
  /** Ordenado por zona (arriba, abajo, abrigo...) como en "Armar look". */
  private readonly ordered = computed(() => [...this.worn()].sort((a, b) => LOOK_SLOTS.indexOf(slotOf(a.category)) - LOOK_SLOTS.indexOf(slotOf(b.category))));
  readonly dressable = computed(() => this.ordered().filter(canWear));
  readonly cameraGarment = computed(() => this.dressable().find(canOverlay) ?? null);
  readonly aiGarments = computed(() =>
    this.worn()
      .filter((g) => AI_WEARABLE.includes(g.category))
      .sort((a, b) => AI_DRESSING_ORDER[a.category] - AI_DRESSING_ORDER[b.category]),
  );
  /** Los zapatos los pone el acabado con IA; los accesorios solo se ven en las vistas al instante. */
  readonly aiShoes = computed(() => this.worn().filter((g) => g.category === 'footwear'));
  readonly onlyInstant = computed(() => this.worn().filter((g) => !AI_WEARABLE.includes(g.category) && g.category !== 'footwear'));
  readonly canGenerate = computed(() => this.aiGarments().length > 0 && (this.photoSource() === 'profile' ? !!this.profile.photoUrl() : !!this.file() && this.ack()));
  readonly wornSummary = computed(() => {
    this.dictionary();
    const names = this.ordered().map((g) => g.name);
    return names.length ? this.transloco.translate('cart.wornSummary', { items: names.join(', ') }) : this.transloco.translate('cart.wornNone');
  });

  constructor() {
    void this.load();
    // Con perfil y foto, la versión con IA parte de la foto del perfil.
    effect(() => {
      const url = this.profile.photoUrl();
      untracked(() => this.photoSource.set(url ? 'profile' : 'file'));
    });
    inject(DestroyRef).onDestroy(() => (this.stopPolling = true));
  }

  async load() {
    this.loading.set(true);
    this.error.set(false);
    try {
      const [garments, bodies] = await Promise.all([this.api.garments(), this.api.bodyModels()]);
      this.session.bodyModels.set(bodies);
      this.catalog.set(garments);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  isWorn(g: GarmentItem) {
    return this.worn().some((w) => w.id === g.id);
  }

  toggle(g: GarmentItem) {
    this.wornIds.set(toggleWorn(this.worn(), g).map((w) => w.id));
  }

  remove(line: Line) {
    this.cart.remove(line.index);
  }

  setSize(index: number, event: Event) {
    this.cart.setSize(index, (event.target as HTMLSelectElement).value);
  }

  /** Talla para la IA: la elegida en el carrito o, si no hay, la del medio de la tabla. */
  sizeFor(g: GarmentItem): string {
    const chosen = this.lines().find((l) => l.garment.id === g.id && l.size)?.size;
    return chosen ?? g.sizeChart[Math.floor(g.sizeChart.length / 2)]?.size ?? 'M';
  }

  pickFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(file);
    if (file) this.photoSource.set('file');
  }

  async generate() {
    const garments = this.aiGarments();
    if (!this.canGenerate()) return;
    this.aiState.set('working');
    this.aiStep.set(1);
    this.aiResult.set(null);
    try {
      const photo = this.photoSource() === 'profile' ? await this.profile.photoBlob() : this.file()!;
      this.savedFavorite.set(false);
      const outfit = [...garments, ...this.aiShoes()].map((g) => ({ garmentId: g.id, size: this.sizeFor(g) }));
      const started = await this.api.startSession({ garmentId: garments[0].id, mode: 'photorealistic', outfit });
      this.aiSession = await this.api.uploadPhoto(started.id, photo);
      this.aiSession = await this.api.generate(started.id);
      await this.poll(started.id, garments.length);
    } catch (err) {
      this.aiState.set('failed');
      this.notices.error(err, 'errors.generate');
    }
  }

  private async poll(id: string, steps: number) {
    const deadline = Date.now() + POLL_LIMIT_MS;
    const started = Date.now();
    while (!this.stopPolling && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const s = await this.api.session(id).catch(() => null);
      if (!s) continue;
      this.aiSession = s;
      // Avance aproximado: cada prenda tarda parecido en la GPU.
      this.aiStep.set(Math.min(steps, 1 + Math.floor((Date.now() - started) / 50_000)));
      if (s.generationStatus === 'done' && s.resultImageUrl) {
        this.aiResult.set(s.resultImageUrl);
        this.aiState.set('done');
        return;
      }
      if (s.generationStatus === 'failed' || s.generationStatus === 'fallback') {
        this.aiState.set('failed');
        return;
      }
    }
    if (!this.stopPolling) this.aiState.set('failed');
  }

  async saveFavorite() {
    if (!this.aiSession) return;
    this.savingFavorite.set(true);
    try {
      await this.api.saveFavorite({ sessionId: this.aiSession.id });
      this.savedFavorite.set(true);
    } catch (err) {
      this.notices.error(err, 'errors.saveResult');
    } finally {
      this.savingFavorite.set(false);
    }
  }

  resetAi() {
    this.savedFavorite.set(false);
    this.aiState.set('idle');
    this.aiResult.set(null);
  }

  async deleteAiPhoto() {
    const s = this.aiSession;
    if (!s) return;
    try {
      await this.api.deletePhoto(s.id);
      this.aiSession = null;
      this.resetAi();
      this.notices.success('photo.deleted');
    } catch (err) {
      this.notices.error(err, 'errors.deletePhoto');
    }
  }
}

function unique(garments: GarmentItem[]): GarmentItem[] {
  return garments.filter((g, i) => garments.findIndex((x) => x.id === g.id) === i);
}
