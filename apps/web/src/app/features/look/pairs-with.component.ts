import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { GarmentItem } from '@vestirse/shared-types';
import { ApiService } from '../../core/api.service';
import { lookQuery } from '../../core/look.store';
import { PricePipe } from '../../shared/price.pipe';
import { completeLook } from './pairing';

/** "Combina con": un look sugerido alrededor de esta prenda y el enlace para armarlo. */
@Component({
  selector: 'app-pairs-with',
  imports: [RouterLink, TranslocoPipe, PricePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (look().length > 1) {
      <h2 class="label-xs">{{ 'look.goesWithTitle' | transloco }}</h2>
      <ul class="mt-3 grid grid-cols-3 gap-2">
        @for (g of look().slice(1); track g.id) {
          <li>
            <a [routerLink]="['/prenda', g.id]" class="group block">
              <span class="block aspect-[3/4] overflow-hidden bg-surface-2"><img [src]="g.images.thumb ?? g.images.photo" alt="" loading="lazy" class="h-full w-full object-cover" /></span>
              <span class="mt-1 block truncate text-[12px] group-hover:underline">{{ g.name }}</span>
              <span class="block text-[12px] text-muted tabular">{{ g.priceCents | price }}</span>
            </a>
          </li>
        }
      </ul>
      <a routerLink="/look" [queryParams]="query()" class="btn mt-4">{{ 'look.seeLook' | transloco }}</a>
    }
  `,
})
export class PairsWithComponent {
  readonly garment = input.required<GarmentItem>();
  readonly bodyId = input<string | null>(null);

  private readonly catalog = signal<GarmentItem[]>([]);
  readonly look = computed(() => {
    const catalog = this.catalog();
    return catalog.length ? completeLook(this.garment(), catalog, ['top', 'bottom', 'outerwear', 'footwear']) : [];
  });
  readonly query = computed(() => lookQuery(this.look().map((g) => g.id), this.bodyId()));

  constructor() {
    inject(ApiService)
      .garments()
      .then((all) => this.catalog.set(all))
      .catch(() => this.catalog.set([])); // sin sugerencias si falla: no es imprescindible
  }
}
