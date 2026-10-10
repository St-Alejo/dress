import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TryOnSessionStore } from '../../core/tryon-session.store';

/**
 * Selector "cuerpo similar al mío" (paso 1): cero foto, cero cámara.
 * Se muestran todos los cuerpos siempre, en el mismo orden, sin destacar ninguno como "ideal".
 */
@Component({
  selector: 'app-body-picker',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="min-w-0">
      <legend class="text-[13px] font-medium">{{ 'body.pick' | transloco }}</legend>
      <p class="text-xs text-muted mt-0.5">{{ 'body.pickHelp' | transloco }}</p>
      <div class="mt-3 flex gap-px overflow-x-auto bg-line pb-px snap-x" role="radiogroup" [attr.aria-label]="'body.pick' | transloco">
        @for (b of store.bodyModels(); track b.id) {
          <button type="button" role="radio" class="snap-start shrink-0 w-[112px] border-b-2 bg-paper p-2 text-left transition-colors"
            [class.border-ink]="store.selectedBodyId() === b.id" [class.border-transparent]="store.selectedBodyId() !== b.id"
            [class.bg-surface-2]="store.selectedBodyId() === b.id"
            [attr.aria-checked]="store.selectedBodyId() === b.id"
            [attr.aria-label]="('body.tag.' + b.bodyTypeTag | transloco) + ', ' + b.heightRangeCm[0] + '–' + b.heightRangeCm[1] + ' cm'"
            (click)="store.selectBody(b.id)">
            <img [src]="b.photoUrl" alt="" class="aspect-[3/4] w-full object-cover" loading="lazy" />
            <span class="mt-2 block text-[11px] leading-tight">{{ 'body.tag.' + b.bodyTypeTag | transloco }}</span>
            <span class="block text-[11px] text-muted tabular">{{ b.heightRangeCm[0] }}–{{ b.heightRangeCm[1] }} cm</span>
          </button>
        }
      </div>
    </fieldset>
  `,
})
export class BodyPickerComponent {
  readonly store = inject(TryOnSessionStore);
}
