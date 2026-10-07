import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, viewChildren } from '@angular/core';
import { nextRovingIndex } from './roving-focus';

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Texto auxiliar pequeño bajo la etiqueta (p. ej. "recomendada"). */
  note?: string;
}

/**
 * Selección única (tallas, tratamiento de rostro, sensación de ajuste) como
 * `radiogroup` WAI-ARIA: un solo elemento enfocable, flechas para moverse y
 * `aria-checked` como único estado (no se mezcla con `aria-pressed`).
 */
@Component({
  selector: 'ui-choice-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="radiogroup" [attr.aria-label]="label()" class="flex flex-wrap gap-2">
      @for (opt of options(); track opt.value; let i = $index) {
        <button
          #choice
          type="button"
          role="radio"
          class="chip flex-col gap-0 leading-tight"
          [class.min-w-[56px]]="compact()"
          [attr.aria-checked]="opt.value === value()"
          [attr.tabindex]="i === focusIndex() ? 0 : -1"
          [disabled]="opt.disabled"
          (click)="choose(opt.value)"
          (keydown)="onKey($event, i)"
        >
          <span>{{ opt.label }}</span>
          @if (opt.note) {
            <span class="text-[10px] uppercase tracking-[0.06em] opacity-70">{{ opt.note }}</span>
          }
        </button>
      }
    </div>
  `,
})
export class ChoiceGroupComponent<T extends string = string> {
  readonly options = input.required<ChoiceOption<T>[]>();
  readonly value = model<T | null>(null);
  readonly label = input<string>();
  readonly compact = input(false);

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('choice');

  /** El elegido recibe el foco con Tab; si no hay elegido, la primera opción habilitada. */
  readonly focusIndex = computed(() => {
    const opts = this.options();
    const selected = opts.findIndex((o) => o.value === this.value() && !o.disabled);
    return selected >= 0 ? selected : Math.max(0, opts.findIndex((o) => !o.disabled));
  });

  choose(v: T) {
    this.value.set(v);
  }

  onKey(event: KeyboardEvent, index: number) {
    const opts = this.options();
    const target = nextRovingIndex(event.key, index, opts.length, (i) => !!opts[i].disabled);
    if (target === null) return;
    event.preventDefault();
    this.choose(opts[target].value);
    this.buttons()[target]?.nativeElement.focus();
  }
}
