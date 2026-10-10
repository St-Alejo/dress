import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ComparisonStore } from '../../core/comparison/comparison.store';
import { IconComponent } from '../../shared/ui/icon.component';

/** Comparar lado a lado sin repetir la captura. Deshacer/rehacer vía Command. */
@Component({
  selector: 'app-comparison-page',
  imports: [RouterLink, TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <section class="mx-auto max-w-screen-2xl px-4 pt-8 pb-16 md:px-8">
      <div class="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-6">
        <div>
          <h1 class="text-[28px] md:text-[32px]">{{ 'compare.title' | transloco }}</h1>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn" [disabled]="!store.canUndo()" (click)="store.undo()">{{ 'compare.undo' | transloco }}</button>
          <button type="button" class="btn" [disabled]="!store.canRedo()" (click)="store.redo()">{{ 'compare.redo' | transloco }}</button>
        </div>
      </div>

      @if (store.items().length === 0) {
        <div class="py-16 text-center">
          <ui-icon name="compare" [size]="28" class="text-muted" />
          <p class="mx-auto mt-4 max-w-sm text-ink-2">{{ 'compare.empty' | transloco }}</p>
          <a routerLink="/" class="btn btn-primary mt-6">{{ 'nav.catalog' | transloco }}</a>
        </div>
      } @else {
        <ul class="-mx-4 mt-6 grid grid-cols-2 gap-px bg-line md:mx-0 lg:grid-cols-4">
          @for (item of store.items(); track item.garmentId) {
            <li class="flex flex-col bg-paper">
              <a [routerLink]="['/prenda', item.garmentId]" class="block aspect-[3/4] bg-surface-2">
                <img [src]="item.imageUrl" [alt]="item.name" class="h-full w-full object-cover" />
              </a>
              <div class="flex flex-1 flex-col gap-1 px-3 pt-3 pb-4">
                <p class="label-xs">{{ item.brandName }}</p>
                <p class="text-[13px] leading-snug">{{ item.name }}</p>
                <p class="text-[13px]">{{ 'compare.size' | transloco }}: <strong class="font-medium">{{ item.size ?? ('compare.noSize' | transloco) }}</strong></p>
                <button type="button" class="btn-ghost mt-auto self-start text-[12px] uppercase tracking-[0.06em]" (click)="store.remove(item.garmentId)">{{ 'compare.remove' | transloco }}</button>
              </div>
            </li>
          }
        </ul>
        <p class="mt-4 text-xs text-muted">{{ 'compare.keyboard' | transloco }}</p>
      }
    </section>
  `,
})
export class ComparisonPage {
  readonly store = inject(ComparisonStore);

  onKey(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.closest('input,textarea')) return;
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.store.undo();
    } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
      e.preventDefault();
      this.store.redo();
    }
  }
}
