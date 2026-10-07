import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NoticeStore } from '../../core/notice.store';
import { IconComponent } from './icon.component';

/**
 * Región de avisos global. Los errores se anuncian con `role="alert"` (asertivo);
 * los éxitos e informativos con `role="status"` (cortés).
 */
@Component({
  selector: 'ui-notices',
  imports: [TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end pointer-events-none">
      @for (n of store.notices(); track n.id) {
        <div
          class="pointer-events-auto flex w-full max-w-sm items-start gap-3 border border-line border-l-2 bg-surface px-4 py-3 text-[13px]"
          [style.border-left-color]="n.kind === 'error' ? 'var(--danger)' : n.kind === 'success' ? 'var(--conf-high)' : 'var(--ink)'"
          [attr.role]="n.kind === 'error' ? 'alert' : 'status'"
        >
          <p class="flex-1">
            {{ n.key | transloco }}
            @if (n.ref) {
              <span class="mt-1 block text-xs text-muted">{{ 'notice.ref' | transloco }}: {{ n.ref.slice(0, 8) }}</span>
            }
          </p>
          <button type="button" class="-m-2 grid size-9 place-items-center text-muted hover:text-ink" [attr.aria-label]="'notice.dismiss' | transloco" (click)="store.dismiss(n.id)">
            <ui-icon name="close" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
})
export class NoticesComponent {
  readonly store = inject(NoticeStore);
}
