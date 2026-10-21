import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { GarmentItem } from '@vestirse/shared-types';
import { ApiService } from '../../core/api.service';
import { LookStore, lookQuery, parseLookIds } from '../../core/look.store';
import { NoticeStore } from '../../core/notice.store';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import { PricePipe } from '../../shared/price.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { TabsComponent, type TabItem } from '../../shared/ui/tabs.component';
import { ApproxViewComponent } from '../catalog/approx-view.component';
import { BodyPickerComponent } from '../catalog/body-picker.component';
import { LiveTryOnComponent } from '../live-overlay/live-tryon.component';
import { canOverlay } from '../live-overlay/overlay-geometry';
import { canWear } from '../live-overlay/engine/tryon-scene';
import { LOOK_SLOTS, type LookSlot, slotOf, suggestionsFor } from './pairing';
import { describeLook } from './look-description';
import { SavedLooksComponent } from './saved-looks.component';

type Stage = 'model' | 'camera';

/**
 * Armar un look: una prenda por hueco (arriba, abajo, abrigo, calzado, accesorio), vista al
 * instante sobre un modelo del catálogo o en la cámara. Las sugerencias "combina con" salen de
 * reglas fijas de color y estilo. El look se guarda en este navegador y se comparte por enlace.
 */
@Component({
  selector: 'app-look-page',
  imports: [RouterLink, TranslocoPipe, PricePipe, IconComponent, SkeletonComponent, TabsComponent, ApproxViewComponent, BodyPickerComponent, LiveTryOnComponent, SavedLooksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-screen-2xl px-4 pt-8 pb-16 md:px-8">
      <header class="max-w-2xl">
        <h1 class="text-[28px] md:text-[40px]">{{ 'look.title' | transloco }}</h1>
        <p class="mt-3 max-w-xl text-[14px] text-ink-2">{{ 'look.lead' | transloco }}</p>
      </header>

      @if (loading()) {
        <p class="sr-only" role="status">{{ 'common.loading' | transloco }}</p>
        <div class="mt-8 grid gap-8 lg:grid-cols-2" aria-hidden="true"><ui-skeleton class="h-[min(70vh,640px)]" /><ui-skeleton class="h-96" /></div>
      } @else if (error()) {
        <div class="mt-8 border border-line p-8 text-center" role="alert">
          <p>{{ 'common.loadError' | transloco }}</p>
          <button type="button" class="btn mt-4" (click)="load()">{{ 'common.retry' | transloco }}</button>
        </div>
      } @else {
        <div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
          <section class="min-w-0 space-y-4" [attr.aria-label]="'look.stage' | transloco">
            <ui-tabs #tabs [items]="stageTabs()" [(active)]="stage" [label]="'look.stage' | transloco" [stretch]="true" />
            <div role="tabpanel" [id]="tabs.panelId(stage())" [attr.aria-labelledby]="tabs.tabId(stage())">
              @if (stage() === 'model') {
                <div class="stage relative h-[min(70vh,640px)] overflow-hidden">
                  @if (session.selectedBody(); as b) {
                    @if (b.pose && wearable().length) {
                      <app-approx-view class="block h-full" [body]="b" [garments]="wearable()" />
                      <p class="absolute right-3 top-3 bg-paper/90 px-2 py-1 text-[11px] text-ink-2">{{ 'body.approxPreview' | transloco }}</p>
                    } @else {
                      <img [src]="b.photoUrl" alt="" class="absolute inset-0 h-full w-full object-contain" />
                    }
                  } @else {
                    <p class="absolute inset-0 grid place-items-center p-8 text-center text-[13px] text-ink-2">{{ 'body.chooseToSee' | transloco }}</p>
                  }
                </div>
                <p class="mt-2 text-[12px] text-muted" aria-live="polite">{{ description() }}</p>
                <div class="mt-4"><app-body-picker /></div>
              } @else {
                @if (cameraGarment(); as g) {
                  <app-live-tryon [garment]="g" [outfit]="wearable()" />
                } @else {
                  <p class="border border-line p-8 text-center text-[13px] text-ink-2">{{ 'look.cameraEmpty' | transloco }}</p>
                }
              }
            </div>
          </section>

          <section class="min-w-0" [attr.aria-label]="'look.pieces' | transloco">
            @for (slot of slots; track slot) {
              <div class="border-b border-line py-5 first:pt-0">
                <div class="flex items-center justify-between gap-3">
                  <h2 class="label-xs">{{ 'look.slot.' + slot | transloco }}</h2>
                  @if (chosenIn(slot); as g) {
                    <button type="button" class="text-[12px] text-ink-2 underline-offset-4 hover:underline" (click)="clearSlot(slot)">{{ 'look.remove' | transloco }}</button>
                  }
                </div>
                @if (chosenIn(slot); as g) {
                  <div class="mt-3 flex items-center gap-3">
                    <img [src]="g.images.thumb ?? g.images.photo" alt="" class="h-20 w-16 bg-surface-2 object-cover" />
                    <div class="min-w-0">
                      <a [routerLink]="['/prenda', g.id]" class="block truncate text-[13px] hover:underline">{{ g.name }}</a>
                      <p class="text-[12px] text-muted">{{ g.brandName }} · <span class="tabular">{{ g.priceCents | price }}</span></p>
                    </div>
                  </div>
                } @else if (blocked(slot)) {
                  <p class="mt-2 text-[12px] text-muted">{{ 'look.dressCovers' | transloco }}</p>
                }
                @if (!blocked(slot)) {
                  <p class="mt-3 text-[11px] text-muted">{{ (chosen().length ? 'look.goesWith' : 'look.options') | transloco }}</p>
                  <ul class="mt-2 flex gap-2 overflow-x-auto pb-1">
                    @for (s of suggestions()[slot]; track s.id) {
                      <li class="shrink-0">
                        <button type="button" class="block w-[72px] border-b-2 text-left" [class.border-ink]="chosenIn(slot)?.id === s.id" [class.border-transparent]="chosenIn(slot)?.id !== s.id"
                          [attr.aria-pressed]="chosenIn(slot)?.id === s.id" [attr.aria-label]="s.name" (click)="choose(s)">
                          <img [src]="s.images.thumb ?? s.images.photo" alt="" loading="lazy" class="aspect-[3/4] w-full bg-surface-2 object-cover" />
                        </button>
                      </li>
                    }
                  </ul>
                }
              </div>
            }

            <div class="flex flex-wrap items-center gap-3 py-5">
              <p class="mr-auto text-[14px]">{{ 'look.total' | transloco }} <span class="tabular">{{ total() | price }}</span></p>
              <button type="button" class="btn" [disabled]="!chosen().length" (click)="copyLink()"><ui-icon name="link" [size]="16" />{{ 'look.share' | transloco }}</button>
              <button type="button" class="btn btn-primary" [disabled]="!chosen().length" (click)="save()">{{ 'look.save' | transloco }}</button>
            </div>
            @if (chosen().length) {
              <button type="button" class="text-[12px] text-ink-2 underline-offset-4 hover:underline" (click)="reset()">{{ 'look.reset' | transloco }}</button>
            }

            @if (looks.looks().length) {
              <div class="mt-8">
                <h2 class="label-xs">{{ 'look.saved' | transloco }}</h2>
                <app-saved-looks class="mt-3 block" [catalog]="catalog()" />
              </div>
            }
          </section>
        </div>
      }
    </section>
  `,
})
export class LookPage {
  /** Desde la URL (withComponentInputBinding): `?prendas=a,b&modelo=b01`. */
  readonly prendas = input<string>();
  readonly modelo = input<string>();

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly notices = inject(NoticeStore);
  private readonly transloco = inject(TranslocoService);
  private readonly dictionary = toSignal(this.transloco.selectTranslation());
  readonly session = inject(TryOnSessionStore);
  readonly looks = inject(LookStore);

  readonly slots = LOOK_SLOTS;
  readonly catalog = signal<GarmentItem[]>([]);
  readonly chosen = signal<GarmentItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly stage = signal<Stage>('model');

  readonly stageTabs = computed<TabItem<Stage>[]>(() => {
    this.dictionary();
    return (['model', 'camera'] as const).map((s) => ({ id: s, label: this.transloco.translate('look.stageTab.' + s) }));
  });
  /** Lo que el motor sabe vestir (con recorte y anclas), en el orden de los huecos. */
  readonly wearable = computed(() => this.ordered().filter(canWear));
  readonly cameraGarment = computed(() => this.wearable().find(canOverlay) ?? null);
  readonly suggestions = computed(() => {
    const chosen = this.chosen();
    const catalog = this.catalog();
    return Object.fromEntries(LOOK_SLOTS.map((s) => [s, suggestionsFor(s, chosen, catalog, 8)])) as Record<LookSlot, GarmentItem[]>;
  });
  readonly total = computed(() => this.chosen().reduce((s, g) => s + g.priceCents, 0));
  readonly description = computed(() => {
    this.dictionary();
    return describeLook(this.ordered(), this.session.selectedBody(), (k, p) => this.transloco.translate(k, p));
  });

  private readonly ordered = computed(() => [...this.chosen()].sort((a, b) => LOOK_SLOTS.indexOf(slotOf(a.category)) - LOOK_SLOTS.indexOf(slotOf(b.category))));

  constructor() {
    void this.load();
    // Abrir un look guardado o compartido (misma página, otros parámetros).
    effect(() => {
      const ids = parseLookIds(this.prendas());
      const body = this.modelo();
      const catalog = this.catalog();
      untracked(() => {
        if (!catalog.length) return;
        if (ids.join(',') !== this.chosen().map((g) => g.id).join(',')) this.chosen.set(ids.map((id) => catalog.find((g) => g.id === id)).filter((g): g is GarmentItem => !!g));
        if (body && this.session.bodyModels().some((b) => b.id === body) && body !== this.session.selectedBodyId()) this.session.selectBody(body);
      });
    });
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

  chosenIn(slot: LookSlot): GarmentItem | undefined {
    return this.chosen().find((g) => slotOf(g.category) === slot);
  }

  /** Un vestido ocupa también la parte de abajo. */
  blocked(slot: LookSlot): boolean {
    return slot === 'bottom' && this.chosen().some((g) => g.category === 'dress');
  }

  choose(g: GarmentItem) {
    const slot = slotOf(g.category);
    const rest = this.chosen().filter((c) => slotOf(c.category) !== slot && !(g.category === 'dress' && slotOf(c.category) === 'bottom'));
    this.update(this.chosenIn(slot)?.id === g.id ? rest : [...rest, g]);
  }

  clearSlot(slot: LookSlot) {
    this.update(this.chosen().filter((g) => slotOf(g.category) !== slot));
  }

  reset() {
    this.update([]);
  }

  save() {
    if (this.looks.save(this.chosen().map((g) => g.id), this.session.selectedBodyId())) this.notices.success('look.savedNotice');
  }

  async copyLink() {
    const tree = this.router.createUrlTree(['/look'], { queryParams: lookQuery(this.chosen().map((g) => g.id), this.session.selectedBodyId()) });
    const url = new URL(this.router.serializeUrl(tree), location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      this.notices.success('look.linkCopied');
    } catch {
      this.notices.info('look.linkManual');
    }
  }

  private update(next: GarmentItem[]) {
    this.chosen.set(next);
    void this.router.navigate([], { queryParams: next.length ? lookQuery(next.map((g) => g.id), this.session.selectedBodyId()) : {}, replaceUrl: true });
  }
}
