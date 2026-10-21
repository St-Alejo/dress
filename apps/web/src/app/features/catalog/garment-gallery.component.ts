import { ChangeDetectionStrategy, Component, ElementRef, computed, input, signal, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { GarmentItem, SimilarBodyModel } from '@vestirse/shared-types';
import { IconComponent } from '../../shared/ui/icon.component';
import { canWear } from '../live-overlay/engine/tryon-scene';
import { ApproxViewComponent } from './approx-view.component';

/** Hasta tres modelos con tallas típicas distintas (la más chica, una media y la más grande). */
export function spreadBySize(bodies: SimilarBodyModel[], sizes: string[], max = 3): SimilarBodyModel[] {
  const rank = (b: SimilarBodyModel) => {
    const i = sizes.indexOf(b.typicalSize);
    return i < 0 ? sizes.length : i;
  };
  const posed = bodies.filter((b) => !!b.pose).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  if (posed.length <= max) return posed;
  const picks = Array.from({ length: max }, (_, k) => posed[Math.round((k * (posed.length - 1)) / (max - 1))]);
  return [...new Set(picks)];
}

/**
 * El modelo con los brazos más sueltos (hombro→codo→muñeca casi vertical): es donde una prenda
 * queda mejor puesta sin elegir a nadie, por ejemplo al pasar el ratón por la tienda.
 */
export function restingBody(bodies: SimilarBodyModel[]): SimilarBodyModel | null {
  const spread = (b: SimilarBodyModel) => {
    const { landmarks: l, width, height } = b.pose!;
    const tilt = (a: number, c: number) => Math.abs(Math.atan2((l[c].x - l[a].x) * width, (l[c].y - l[a].y) * height));
    return Math.max(tilt(11, 13), tilt(13, 15), tilt(12, 14), tilt(14, 16));
  };
  const posed = bodies.filter((b) => b.pose?.landmarks?.length);
  return posed.reduce<SimilarBodyModel | null>((best, b) => (!best || spread(b) < spread(best) ? b : best), null);
}

type Shot = { kind: 'photo' | 'cutout'; src: string } | { kind: 'body'; body: SimilarBodyModel };

/**
 * Galería de la ficha: la foto real de producto, el recorte sobre fondo neutro y la prenda
 * puesta al instante en tres modelos de tallas distintas. Las fotos se amplían con zoom.
 */
@Component({
  selector: 'app-garment-gallery',
  imports: [TranslocoPipe, IconComponent, ApproxViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="flex gap-2 overflow-x-auto pb-1" [attr.aria-label]="'gallery.label' | transloco">
      @for (s of shots(); track $index) {
        <li class="shrink-0">
          @if (s.kind === 'body') {
            <figure class="w-[104px]">
              <div class="relative h-[138px] overflow-hidden bg-[#f6f5f2]">
                <app-approx-view class="block h-full" [body]="s.body" [garments]="[garment()]" />
              </div>
              <figcaption class="mt-1 text-[11px] text-muted">{{ 'gallery.onSize' | transloco: { size: s.body.typicalSize } }}</figcaption>
            </figure>
          } @else {
            <button type="button" class="block w-[104px] text-left" (click)="open(s.src)" [attr.aria-label]="('gallery.zoom.' + s.kind) | transloco">
              <span class="block h-[138px] overflow-hidden bg-[#f6f5f2]">
                <img [src]="s.src" alt="" loading="lazy" class="h-full w-full object-contain" />
              </span>
              <span class="mt-1 flex items-center gap-1 text-[11px] text-muted"><ui-icon name="search" [size]="12" />{{ 'gallery.' + s.kind | transloco }}</span>
            </button>
          }
        </li>
      }
    </ul>

    <dialog #zoomDialog class="m-auto max-h-[92dvh] w-[min(92vw,900px)] max-w-none bg-paper p-0 text-ink backdrop:bg-black/60" [attr.aria-label]="'gallery.zoomTitle' | transloco" (close)="zoomSrc.set(null)">
      @if (zoomSrc(); as src) {
        <div class="relative">
          <button type="button" class="absolute right-2 top-2 z-10 grid size-11 place-items-center bg-paper/90" (click)="close()" [attr.aria-label]="'common.close' | transloco"><ui-icon name="close" [size]="18" /></button>
          <div class="h-[min(85dvh,1000px)] cursor-zoom-in overflow-hidden bg-[#f6f5f2]" (pointermove)="pan($event)" (pointerleave)="zoomed.set(false)" (click)="zoomed.set(!zoomed())">
            <img [src]="src" [alt]="garment().name" class="h-full w-full object-contain transition-transform duration-200"
              [style.transform]="zoomed() ? 'scale(2.4)' : 'none'" [style.transform-origin]="origin()" />
          </div>
          <p class="px-4 py-2 text-[12px] text-muted">{{ 'gallery.zoomHelp' | transloco }}</p>
        </div>
      }
    </dialog>
  `,
})
export class GarmentGalleryComponent {
  readonly garment = input.required<GarmentItem>();
  readonly bodies = input<SimilarBodyModel[]>([]);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('zoomDialog');
  readonly zoomSrc = signal<string | null>(null);
  readonly zoomed = signal(false);
  readonly origin = signal('50% 50%');

  readonly shots = computed<Shot[]>(() => {
    const g = this.garment();
    const out: Shot[] = [{ kind: 'photo', src: g.images.photo }];
    if (g.images.cutout) out.push({ kind: 'cutout', src: g.images.cutout });
    if (canWear(g)) {
      for (const body of spreadBySize(this.bodies(), g.sizeChart.map((s) => s.size))) out.push({ kind: 'body', body });
    }
    return out;
  });

  open(src: string) {
    this.zoomSrc.set(src);
    this.zoomed.set(false);
    this.dialog().nativeElement.showModal();
  }

  close() {
    this.dialog().nativeElement.close();
  }

  /** El zoom sigue al puntero: se amplía la zona que se está mirando. */
  pan(ev: PointerEvent) {
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((ev.clientX - box.left) / box.width) * 100;
    const y = ((ev.clientY - box.top) / box.height) * 100;
    this.origin.set(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
  }
}
