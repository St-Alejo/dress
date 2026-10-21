import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { GarmentItem } from '@vestirse/shared-types';
import { LookStore, lookQuery } from '../../core/look.store';
import { IconComponent } from '../../shared/ui/icon.component';

/** Lista de looks guardados en este navegador: abrir (enlace a /look) o borrar uno. */
@Component({
  selector: 'app-saved-looks',
  imports: [RouterLink, TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="space-y-2">
      @for (l of looks.looks(); track l.id) {
        <li class="flex items-center gap-2">
          <a routerLink="/look" [queryParams]="queryFor(l.garmentIds, l.bodyId)" class="flex min-w-0 flex-1 gap-1" [attr.aria-label]="namesOf(l.garmentIds)">
            @for (g of garmentsOf(l.garmentIds); track g.id) {
              <img [src]="g.images.thumb ?? g.images.photo" alt="" class="h-14 w-11 bg-surface-2 object-cover" />
            }
          </a>
          <button type="button" class="grid size-10 place-items-center text-ink-2 hover:text-ink" [attr.aria-label]="'look.delete' | transloco" (click)="looks.remove(l.id)"><ui-icon name="close" [size]="16" /></button>
        </li>
      }
    </ul>
  `,
})
export class SavedLooksComponent {
  readonly catalog = input.required<GarmentItem[]>();
  readonly looks = inject(LookStore);

  queryFor(ids: string[], bodyId: string | null) {
    return lookQuery(ids, bodyId);
  }

  garmentsOf(ids: string[]): GarmentItem[] {
    return ids.map((id) => this.catalog().find((g) => g.id === id)).filter((g): g is GarmentItem => !!g);
  }

  namesOf(ids: string[]): string {
    return this.garmentsOf(ids).map((g) => g.name).join(', ');
  }
}
