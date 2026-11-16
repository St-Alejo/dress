import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { GarmentItem } from '@vestirse/shared-types';
import { PricePipe } from '../price.pipe';

/** Color aproximado del punto de muestra a partir del nombre del color del catálogo. */
const DOTS: [RegExp, string][] = [
  [/negr|black/i, '#111'],
  [/blanc|white|crud|cream|marfil/i, '#f1efe9'],
  [/gris|grey|gray/i, '#8d8d8a'],
  [/azul|blue|navy|denim|celeste/i, '#3f5f8f'],
  [/roj|red|burdeo|vino/i, '#b3261e'],
  [/verde|green|oliva|olive|menta|mint/i, '#5d7a4a'],
  [/amarill|yellow|mostaza/i, '#e2b93b'],
  [/rosa|pink/i, '#e6a5b5'],
  [/naranj|orange/i, '#e0742c'],
  [/morad|purple|lila/i, '#7556a6'],
  [/beige|camel|caqui|khaki|arena|tan/i, '#c2a882'],
  [/marr|brown|choco|caf/i, '#6f4b33'],
];

/**
 * Tarjeta de producto de la tienda: foto en gris de estudio con esquinas suaves y debajo la ficha
 * en monoespaciada (nombre, precio y color). `wide` ocupa dos columnas en la retícula editorial.
 */
@Component({
  selector: 'ui-product-card',
  imports: [RouterLink, TranslocoPipe, PricePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <a [routerLink]="['/prenda', garment().id]" class="group block" [attr.data-cursor]="'home.cursor.view' | transloco">
      <div class="shot" [style.aspect-ratio]="ratio()">
        <img [src]="image() ?? garment().images.thumb ?? garment().images.photo" [attr.srcset]="srcset()" [attr.sizes]="srcset() ? sizes() : null"
          [alt]="garment().name" loading="lazy" decoding="async" class="zoomable absolute inset-0 h-full w-full object-cover" />
        <ng-content />
      </div>
      <div class="mono mt-3 space-y-1 px-0.5">
        <p class="leading-snug text-ink">{{ garment().name }}</p>
        <p class="flex items-center gap-2 text-ink-2">
          <span class="tabular">{{ garment().priceCents | price }}</span>
          @if (garment().brandName; as brand) {<span class="text-muted">{{ brand }}</span>}
        </p>
        <span class="mt-1 inline-block size-2.5 rounded-full ring-1 ring-line" [style.background]="dot()" [title]="garment().color"></span>
      </div>
    </a>
  `,
})
export class ProductCardComponent {
  readonly garment = input.required<GarmentItem>();
  /** Imagen alternativa (prueba sobre el modelo elegido). */
  readonly image = input<string | null>(null);
  readonly ratio = input('3 / 4');
  readonly sizes = input('(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw');

  readonly dot = computed(() => DOTS.find(([re]) => re.test(this.garment().color))?.[1] ?? '#bdbdb8');
  readonly srcset = computed(() => {
    const g = this.garment();
    if (this.image() || !g.images.thumb) return null;
    return `${g.images.thumb} 384w, ${g.images.photo} 768w`;
  });
}
