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
    <fieldset>
      <legend class="text-sm font-medium">{{ 'body.pick' | transloco }}</legend>
      <p class="text-xs text-[var(--muted)] mt-0.5">{{ 'body.pickHelp' | transloco }}</p>
      <div class="mt-3 flex gap-2 overflow-x-auto pb-2 snap-x" role="radiogroup">
        @for (b of store.bodyModels(); track b.id) {
          <button type="button" role="radio" class="snap-start shrink-0 w-[92px] rounded-xl border p-1.5 text-left transition"
            [class.border-[var(--ink)]]="store.selectedBodyId() === b.id" [class.border-[var(--line)]]="store.selectedBodyId() !== b.id"
            [class.bg-[var(--surface-2)]]="store.selectedBodyId() === b.id"
            [attr.aria-checked]="store.selectedBodyId() === b.id"
            [attr.aria-label]="('body.tag.' + b.bodyTypeTag | transloco) + ', ' + b.heightRangeCm[0] + '–' + b.heightRangeCm[1] + ' cm'"
            (click)="store.selectBody(b.id)">
            <img [src]="b.avatarUrl" alt="" class="h-24 w-full object-contain" loading="lazy" />
            <span class="block text-[11px] leading-tight mt-1">{{ 'body.tag.' + b.bodyTypeTag | transloco }}</span>
            <span class="block text-[11px] text-[var(--muted)]">{{ b.heightRangeCm[0] }}–{{ b.heightRangeCm[1] }} cm</span>
          </button>
        }
      </div>
    </fieldset>
  `,
})
export class BodyPickerComponent {
  readonly store = inject(TryOnSessionStore);
}
