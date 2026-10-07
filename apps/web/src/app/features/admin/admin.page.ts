import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Brand, GarmentCategory, GarmentItem, TryOnMode } from '@vestirse/shared-types';
import { ApiService, type AdminBodyModel, type AdminGarment, type AdminMetrics } from '../../core/api.service';
import { AppError } from '../../core/http/app-error';
import { NoticeStore } from '../../core/notice.store';
import { PricePipe } from '../../shared/price.pipe';
import { TabsComponent, type TabItem } from '../../shared/ui/tabs.component';

type Tab = 'metrics' | 'garments' | 'bodies';

const STYLES = ['tshirt', 'shirt', 'hoodie', 'sweater', 'jacket', 'coat', 'jeans', 'trousers', 'shorts', 'skirt', 'dress-a', 'dress-wrap', 'sneakers', 'boots', 'scarf', 'cap', 'bag'];
const STYLE_CATEGORY: Record<string, GarmentCategory> = {
  tshirt: 'top', shirt: 'top', hoodie: 'top', sweater: 'top', jacket: 'outerwear', coat: 'outerwear',
  jeans: 'bottom', trousers: 'bottom', shorts: 'bottom', skirt: 'bottom', 'dress-a': 'dress', 'dress-wrap': 'dress',
  sneakers: 'footwear', boots: 'footwear', scarf: 'accessory', cap: 'accessory', bag: 'accessory',
};
const LETTERS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];
const STANDARD_CHEST: Record<string, [number, number]> = {
  XS: [78, 84], S: [85, 91], M: [92, 99], L: [100, 107], XL: [108, 115], XXL: [116, 123], '3XL': [124, 131], '4XL': [132, 140],
};

@Component({
  selector: 'app-admin-page',
  imports: [FormsModule, TranslocoPipe, PricePipe, TabsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-screen-2xl px-4 pt-8 pb-16 space-y-6 md:px-8">
      <header class="space-y-6">
        <h1 class="text-[28px] md:text-[32px]">{{ 'admin.title' | transloco }}</h1>
        <ui-tabs #adminTabs [items]="tabItems()" [(active)]="tab" [label]="'admin.title' | transloco" />
      </header>

      @if (message()) {<p class="card p-3 text-sm" role="status">{{ message() }}</p>}

      @switch (tab()) {
        @case ('metrics') {
          @if (metrics(); as m) {
            <div class="flex gap-2">
              @for (d of [7, 30, 0]; track d) {
                <button type="button" class="chip" [attr.aria-pressed]="days() === d" (click)="loadMetrics(d)">{{ d ? ('admin.days' | transloco: { n: d }) : ('admin.allTime' | transloco) }}</button>
              }
            </div>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div class="card p-4"><p class="eyebrow">{{ 'admin.m.recommendations' | transloco }}</p><p class="text-[28px] md:text-[32px]">{{ m.recommendations }}</p></div>
              <div class="card p-4"><p class="eyebrow">{{ 'admin.m.overrideRate' | transloco }}</p><p class="text-[28px] md:text-[32px]">{{ (m.overrideRate * 100).toFixed(0) }}%</p><p class="text-xs text-muted">{{ 'admin.m.overrideHelp' | transloco }}</p></div>
              <div class="card p-4"><p class="eyebrow">{{ 'admin.m.genTime' | transloco }}</p><p class="text-[28px] md:text-[32px]">{{ secs(m.avgGenerationMs) }}</p><p class="text-xs text-muted">{{ 'admin.m.perceived' | transloco }}: {{ secs(m.avgPerceivedMs) }}</p></div>
              <div class="card p-4"><p class="eyebrow">{{ 'admin.m.failures' | transloco }}</p><p class="text-[28px] md:text-[32px]">{{ m.generationFailures }}</p><p class="text-xs text-muted">{{ 'admin.m.fallbackHelp' | transloco }}</p></div>
            </div>
            <div class="card p-5">
              <h2 class="text-lg">{{ 'admin.m.modes' | transloco }}</h2>
              <ul class="mt-3 space-y-2">
                @for (mode of modeKeys; track mode) {
                  <li class="grid grid-cols-[140px_1fr_48px] items-center gap-3 text-sm">
                    <span>{{ 'mode.' + mode | transloco }}</span>
                    <span class="h-3 bg-surface-2 overflow-hidden"><span class="block h-full bg-accent" [style.width.%]="modePct(mode)"></span></span>
                    <span class="text-right tabular-nums">{{ m.modeDistribution[mode] }}</span>
                  </li>
                }
              </ul>
              <p class="mt-3 text-xs text-muted">{{ 'admin.m.noBodyTime' | transloco }}</p>
            </div>
            <div class="card p-5 overflow-x-auto">
              <h2 class="text-lg">{{ 'admin.m.calibration' | transloco }}</h2>
              <table class="mt-3 w-full text-sm">
                <thead class="text-left text-muted"><tr><th class="py-1">{{ 'admin.brand' | transloco }}</th><th>{{ 'admin.category' | transloco }}</th><th>{{ 'admin.samples' | transloco }}</th><th>{{ 'admin.shift' | transloco }}</th></tr></thead>
                <tbody>
                  @for (c of m.calibrations; track c.brand + c.category) {
                    <tr class="border-t border-line">
                      <td class="py-1.5">{{ c.brand }}</td><td>{{ 'category.' + c.category | transloco }}</td><td class="tabular-nums">{{ c.sampleSize }}</td>
                      <td class="tabular-nums">{{ c.meanShift > 0 ? '+' : '' }}{{ c.meanShift.toFixed(2) }} {{ (c.sampleSize >= 20 && (c.meanShift >= 0.5 || c.meanShift <= -0.5) ? 'admin.applied' : 'admin.notApplied') | transloco }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
        @case ('garments') {
          <form class="card p-5 grid gap-3 sm:grid-cols-3" (ngSubmit)="createGarment()">
            <h2 class="text-lg sm:col-span-3">{{ 'admin.newGarment' | transloco }}</h2>
            <label class="field sm:col-span-2">{{ 'admin.name' | transloco }}<input name="name" required minlength="2" [(ngModel)]="draft.name" /></label>
            <label class="field">{{ 'admin.brand' | transloco }}
              <select name="brand" required [(ngModel)]="draft.brandId">@for (b of brands(); track b.id) {<option [value]="b.id">{{ b.name }}</option>}</select>
            </label>
            <label class="field">{{ 'admin.style' | transloco }}
              <select name="style" [(ngModel)]="draft.style">@for (s of styles; track s) {<option [value]="s">{{ s }}</option>}</select>
            </label>
            <label class="field">{{ 'admin.color' | transloco }}<input type="color" name="color" [(ngModel)]="draft.color" /></label>
            <label class="field">{{ 'admin.pattern' | transloco }}
              <select name="pattern" [(ngModel)]="draft.pattern">@for (p of ['solid', 'stripes', 'dots', 'check']; track p) {<option [value]="p">{{ p }}</option>}</select>
            </label>
            <label class="field">{{ 'admin.price' | transloco }}<input type="number" name="price" min="0" required [(ngModel)]="draft.priceCents" /></label>
            <label class="field">{{ 'admin.stretch' | transloco }}
              <select name="stretch" [(ngModel)]="draft.stretch">@for (s of ['none', 'low', 'medium', 'high']; track s) {<option [value]="s">{{ s }}</option>}</select>
            </label>
            <p class="text-xs text-muted sm:col-span-3">{{ 'admin.chartNote' | transloco }}</p>
            <button type="submit" class="btn btn-primary sm:col-span-3 justify-self-start" [disabled]="busy()">{{ 'admin.create' | transloco }}</button>
          </form>
          <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            @for (g of garments(); track g.id) {
              <li class="card p-3 flex gap-3" [class.opacity-60]="!g.active">
                <img [src]="g.images.photo ?? g.images.flat" alt="" class="h-20 w-16 bg-surface-2" [class.object-cover]="!!g.images.photo" [class.object-contain]="!g.images.photo" />
                <div class="min-w-0 flex-1">
                  <p class="font-medium truncate">{{ g.name }}</p>
                  <p class="text-xs text-muted">{{ g.brandName }} · {{ g.priceCents | price }} · {{ g.sizeChart.length }} {{ 'admin.sizes' | transloco }}</p>
                  <button type="button" class="mt-2 text-xs underline" (click)="toggleActive(g)">{{ (g.active ? 'admin.deactivate' : 'admin.activate') | transloco }}</button>
                </div>
              </li>
            }
          </ul>
        }
        @case ('bodies') {
          <p class="text-sm text-ink-2">{{ 'admin.bodiesRule' | transloco }}</p>
          <form class="card p-5 grid gap-3 sm:grid-cols-4" (ngSubmit)="createBody()">
            <h2 class="text-lg sm:col-span-4">{{ 'admin.newBody' | transloco }}</h2>
            <label class="field">{{ 'admin.tag' | transloco }}<input name="tag" required [(ngModel)]="body.bodyTypeTag" /></label>
            <label class="field">{{ 'admin.typicalSize' | transloco }}<select name="size" [(ngModel)]="body.typicalSize">@for (s of letters; track s) {<option>{{ s }}</option>}</select></label>
            <label class="field">{{ 'admin.heightMin' | transloco }}<input type="number" name="hmin" [(ngModel)]="body.heightMin" /></label>
            <label class="field">{{ 'admin.heightMax' | transloco }}<input type="number" name="hmax" [(ngModel)]="body.heightMax" /></label>
            <label class="field">{{ 'fit.chest' | transloco }}<input type="number" name="chest" [(ngModel)]="body.chestCm" /></label>
            <label class="field">{{ 'fit.waist' | transloco }}<input type="number" name="waist" [(ngModel)]="body.waistCm" /></label>
            <label class="field">{{ 'fit.hip' | transloco }}<input type="number" name="hip" [(ngModel)]="body.hipCm" /></label>
            <label class="field">{{ 'admin.shoulders' | transloco }}<input type="number" name="sh" [(ngModel)]="body.shoulderCm" /></label>
            <label class="field">{{ 'admin.skin' | transloco }}<input type="color" name="skin" [(ngModel)]="body.skinTone" /></label>
            <label class="field">{{ 'admin.hair' | transloco }}<select name="hair" [(ngModel)]="body.hair">@for (h of ['short', 'long', 'bun', 'curly', 'none']; track h) {<option>{{ h }}</option>}</select></label>
            <label class="field">{{ 'admin.hairColor' | transloco }}<input type="color" name="hairColor" [(ngModel)]="body.hairColor" /></label>
            <button type="submit" class="btn btn-primary self-end" [disabled]="busy()">{{ 'admin.create' | transloco }}</button>
          </form>
          <ul class="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            @for (b of bodies(); track b.id) {
              <li class="card p-2 text-center text-xs">
                <img [src]="'/api/media/' + (b.photoKey ?? b.avatarKey)" alt="" class="h-28 w-full" [class.object-cover]="!!b.photoKey" [class.object-contain]="!b.photoKey" />
                <p class="mt-1">{{ 'body.tag.' + b.bodyTypeTag | transloco }}</p>
                <p class="text-muted">{{ b.typicalSize }} · {{ b.heightMin }}–{{ b.heightMax }}</p>
                <button type="button" class="mt-1 underline" (click)="deleteBody(b)">{{ 'admin.delete' | transloco }}</button>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class AdminPage {
  private readonly api = inject(ApiService);
  private readonly notices = inject(NoticeStore);
  readonly tabs: Tab[] = ['metrics', 'garments', 'bodies'];
  readonly tab = signal<Tab>('metrics');
  private readonly transloco = inject(TranslocoService);
  private readonly dictionary = toSignal(this.transloco.selectTranslation());
  readonly tabItems = computed<TabItem<Tab>[]>(() => {
    this.dictionary();
    return this.tabs.map((t) => ({ id: t, label: this.transloco.translate('admin.tab.' + t) }));
  });
  readonly styles = STYLES;
  readonly letters = LETTERS;
  readonly modeKeys: TryOnMode[] = ['similar-model', 'live-overlay', 'photorealistic'];

  readonly metrics = signal<AdminMetrics | null>(null);
  readonly days = signal(30);
  readonly garments = signal<AdminGarment[]>([]);
  readonly brands = signal<Brand[]>([]);
  readonly bodies = signal<AdminBodyModel[]>([]);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);

  draft = { name: '', brandId: '', style: 'tshirt', color: '#3f5f86', pattern: 'solid', priceCents: 2999, stretch: 'low' as GarmentItem['stretch'] };
  body = { bodyTypeTag: '', typicalSize: 'M', heightMin: 165, heightMax: 175, chestCm: 98, waistCm: 82, hipCm: 102, shoulderCm: 43, skinTone: '#c99a74', hair: 'short', hairColor: '#2b1b12' };

  private readonly modeTotal = computed(() => {
    const d = this.metrics()?.modeDistribution;
    return d ? Math.max(1, d['similar-model'] + d['live-overlay'] + d.photorealistic) : 1;
  });

  constructor() {
    void this.loadMetrics(30);
    void this.refresh();
  }

  modePct(mode: TryOnMode) {
    return ((this.metrics()?.modeDistribution[mode] ?? 0) / this.modeTotal()) * 100;
  }

  secs(ms: number | null) {
    return ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`;
  }

  async loadMetrics(days: number) {
    this.days.set(days);
    try {
      this.metrics.set(await this.api.adminMetrics(days || undefined));
    } catch (err) {
      this.notices.error(err, 'errors.load');
    }
  }

  async refresh() {
    try {
      const [garments, brands, bodies] = await Promise.all([this.api.adminGarments(), this.api.adminBrands(), this.api.adminBodyModels()]);
      this.garments.set(garments);
      this.brands.set(brands);
      this.bodies.set(bodies);
      if (!this.draft.brandId && brands[0]) this.draft.brandId = brands[0].id;
    } catch (err) {
      this.notices.error(err, 'errors.load');
    }
  }

  async createGarment() {
    const category = STYLE_CATEGORY[this.draft.style];
    // Tabla estándar por pecho para prendas superiores; genérica para el resto (se puede editar luego vía API).
    const sizeChart = LETTERS.map((size) => (category === 'top' || category === 'outerwear' || category === 'dress' ? { size, chest: STANDARD_CHEST[size] } : { size }));
    await this.run(() => this.api.adminCreateGarment({ ...this.draft, priceCents: Number(this.draft.priceCents), category, sizeChart }), 'admin.created');
  }

  async toggleActive(g: AdminGarment) {
    await this.run(() => this.api.adminUpdateGarment(g.id, { active: !g.active }));
  }

  async createBody() {
    const b = this.body;
    await this.run(
      () =>
        this.api.adminCreateBodyModel({
          ...b,
          heightMin: Number(b.heightMin), heightMax: Number(b.heightMax), chestCm: Number(b.chestCm),
          waistCm: Number(b.waistCm), hipCm: Number(b.hipCm), shoulderCm: Number(b.shoulderCm),
        }),
      'admin.created',
    );
  }

  async deleteBody(b: AdminBodyModel) {
    await this.run(() => this.api.adminDeleteBodyModel(b.id));
  }

  private async run(fn: () => Promise<unknown>, okMessage?: string) {
    this.busy.set(true);
    this.message.set(null);
    try {
      await fn();
      if (okMessage) this.notices.success(okMessage);
      await this.refresh();
    } catch (err) {
      // En admin el detalle del servidor (validación) es útil tal cual.
      const e = AppError.from(err);
      if (e.status === 400 || e.status === 409 || e.status === 422) this.message.set(e.message);
      else this.notices.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
