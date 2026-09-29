import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ComparisonStore } from '../../core/comparison/comparison.store';

/** Paso 8: comparar lado a lado sin repetir la captura. Deshacer/rehacer vía Command. */
@Component({
  selector: 'app-comparison-page',
  imports: [RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <section class="mx-auto max-w-6xl px-4 pt-8 pb-16">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="eyebrow">{{ 'compare.eyebrow' | transloco }}</p>
          <h1 class="mt-2 text-3xl">{{ 'compare.title' | transloco }}</h1>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn" [disabled]="!store.canUndo()" (click)="store.undo()" [attr.aria-label]="'compare.undo' | transloco">↶ {{ 'compare.undo' | transloco }}</button>
          <button type="button" class="btn" [disabled]="!store.canRedo()" (click)="store.redo()" [attr.aria-label]="'compare.redo' | transloco">↷ {{ 'compare.redo' | transloco }}</button>
        </div>
      </div>

      @if (store.items().length === 0) {
        <div class="card mt-8 p-6">
          <p>{{ 'compare.empty' | transloco }}</p>
          <a routerLink="/" class="btn btn-primary mt-4">{{ 'nav.catalog' | transloco }}</a>
        </div>
      } @else {
        <ul class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          @for (item of store.items(); track item.garmentId) {
            <li class="card overflow-hidden flex flex-col">
              <a [routerLink]="['/prenda', item.garmentId]" class="block aspect-[3/4] bg-[var(--surface-2)]">
                <img [src]="item.imageUrl" [alt]="item.name" class="h-full w-full object-contain p-3" />
              </a>
              <div class="p-3 space-y-2 flex-1 flex flex-col">
                <p class="text-xs text-[var(--muted)]">{{ item.brandName }}</p>
                <p class="font-medium leading-snug">{{ item.name }}</p>
                <p class="text-sm">{{ 'compare.size' | transloco }}: <strong>{{ item.size ?? ('compare.noSize' | transloco) }}</strong></p>
                <button type="button" class="btn btn-ghost mt-auto self-start text-sm" (click)="store.remove(item.garmentId)">{{ 'compare.remove' | transloco }}</button>
              </div>
            </li>
          }
        </ul>
        <p class="mt-4 text-xs text-[var(--muted)]">{{ 'compare.keyboard' | transloco }}</p>
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
