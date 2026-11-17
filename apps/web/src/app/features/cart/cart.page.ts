import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { GarmentItem } from '@vestirse/shared-types';
import { ApiService } from '../../core/api.service';
import { CartStore, defaultOutfit, toggleWorn } from '../../core/cart.store';
import { TryOnSessionStore } from '../../core/tryon-session.store';
import { PricePipe } from '../../shared/price.pipe';
import { IconComponent } from '../../shared/ui/icon.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { TabsComponent, type TabItem } from '../../shared/ui/tabs.component';
import { AiOutfitComponent } from '../ai-outfit/ai-outfit.component';
import { ApproxViewComponent } from '../catalog/approx-view.component';
import { BodyPickerComponent } from '../catalog/body-picker.component';
import { canWear } from '../live-overlay/engine/tryon-scene';
import { LOOK_SLOTS, slotOf } from '../look/pairing';

type Stage = 'model' | 'ai';


interface Line {
  index: number;
  garment: GarmentItem;
  size: string | null;
}

/**
 * Carrito con probador: se puede comprar dos camisas, pero el probador viste una prenda por
 * zona (otra camisa sustituye a la anterior; un vestido ocupa camisa y pantalón). Tres vistas:
 * al instante sobre un modelo, en la cámara (no sale del dispositivo) y una versión realista con
 * IA de imagen (app-ai-outfit) con las tallas elegidas aquí.
 */
@Component({
  selector: 'app-cart-page',
  imports: [RouterLink, TranslocoPipe, PricePipe, IconComponent, SkeletonComponent, TabsComponent, ApproxViewComponent, BodyPickerComponent, AiOutfitComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .stage {
      background: #f6f5f2;
    }
  `,
  template: `
    <section class="mx-auto max-w-screen-2xl px-4 pt-8 pb-16 md:px-8">
      <header class="max-w-2xl">
        <h1 class="display text-[clamp(44px,8vw,128px)]">{{ 'cart.title' | transloco }}</h1>
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
                @case ('ai') {
                  <app-ai-outfit [garments]="ordered()" [sizes]="cartSizes()" />
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
  private readonly transloco = inject(TranslocoService);
  private readonly dictionary = toSignal(this.transloco.selectTranslation());
  readonly cart = inject(CartStore);
  readonly session = inject(TryOnSessionStore);

  readonly slotOf = slotOf;
  readonly catalog = signal<GarmentItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly stage = signal<Stage>('model');
  /** Lo que lleva puesto el probador (ids), una prenda por zona. */
  readonly wornIds = signal<string[] | null>(null);

  readonly stageTabs = computed<TabItem<Stage>[]>(() => {
    this.dictionary();
    return (['model', 'ai'] as const).map((s) => ({ id: s, label: this.transloco.translate('cart.stage.' + s) }));
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
  readonly ordered = computed(() => [...this.worn()].sort((a, b) => LOOK_SLOTS.indexOf(slotOf(a.category)) - LOOK_SLOTS.indexOf(slotOf(b.category))));
  readonly dressable = computed(() => this.ordered().filter(canWear));
  /** Tallas elegidas en la bolsa, para la prueba con IA. */
  readonly cartSizes = computed(() => Object.fromEntries(this.lines().filter((l) => l.size).map((l) => [l.garment.id, l.size!])));
  readonly wornSummary = computed(() => {
    this.dictionary();
    const names = this.ordered().map((g) => g.name);
    return names.length ? this.transloco.translate('cart.wornSummary', { items: names.join(', ') }) : this.transloco.translate('cart.wornNone');
  });

  constructor() {
    void this.load();
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

}

function unique(garments: GarmentItem[]): GarmentItem[] {
  return garments.filter((g, i) => garments.findIndex((x) => x.id === g.id) === i);
}
