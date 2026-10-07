import { ChangeDetectionStrategy, Component, ElementRef, input, model, viewChildren } from '@angular/core';
import { nextRovingIndex } from './roving-focus';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
}

let nextId = 0;

/**
 * Pestañas accesibles (patrón WAI-ARIA "tabs" con activación automática):
 * tablist/tab con roving tabindex, flechas, Inicio/Fin y `aria-controls`.
 * El panel lo pinta quien usa el componente, con `panelId()` y `tabId()`:
 *
 *   <ui-tabs #t [items]="..." [(active)]="modo" />
 *   <div role="tabpanel" [id]="t.panelId(modo())" [attr.aria-labelledby]="t.tabId(modo())">…</div>
 */
@Component({
  selector: 'ui-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="tablist" [attr.aria-label]="label()" class="flex border-b border-line" [class.w-full]="stretch()">
      @for (item of items(); track item.id; let i = $index) {
        <button
          #tab
          type="button"
          role="tab"
          [id]="tabId(item.id)"
          [attr.aria-selected]="item.id === active()"
          [attr.aria-controls]="panelId(item.id)"
          [attr.tabindex]="item.id === active() ? 0 : -1"
          class="-mb-px min-h-[44px] border-b-2 px-1 text-[12px] font-medium uppercase tracking-[0.06em] transition-colors"
          [class.flex-1]="stretch()"
          [class.mr-6]="!stretch()"
          [class.border-ink]="item.id === active()"
          [class.text-ink]="item.id === active()"
          [class.border-transparent]="item.id !== active()"
          [class.text-muted]="item.id !== active()"
          (click)="select(item.id)"
          (keydown)="onKey($event, i)"
        >
          {{ item.label }}
        </button>
      }
    </div>
  `,
})
export class TabsComponent<T extends string = string> {
  readonly items = input.required<TabItem<T>[]>();
  readonly active = model.required<T>();
  readonly label = input<string>();
  /** Reparte el ancho entre las pestañas (útil en móvil). */
  readonly stretch = input(false);

  private readonly uid = `tabs-${++nextId}`;
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tab');

  tabId(id: string) {
    return `${this.uid}-tab-${id}`;
  }
  panelId(id: string) {
    return `${this.uid}-panel-${id}`;
  }

  select(id: T) {
    this.active.set(id);
  }

  onKey(event: KeyboardEvent, index: number) {
    const target = nextRovingIndex(event.key, index, this.items().length);
    if (target === null) return;
    event.preventDefault();
    this.select(this.items()[target].id);
    this.buttons()[target]?.nativeElement.focus();
  }
}
