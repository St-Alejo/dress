import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ChoiceGroupComponent, type ChoiceOption } from './choice-group.component';
import { nextRovingIndex } from './roving-focus';
import { TabsComponent, type TabItem } from './tabs.component';

describe('nextRovingIndex', () => {
  it('avanza y retrocede con flechas, en ciclo', () => {
    expect(nextRovingIndex('ArrowRight', 0, 3)).toBe(1);
    expect(nextRovingIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextRovingIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextRovingIndex('ArrowDown', 1, 3)).toBe(2);
  });

  it('salta las opciones deshabilitadas y respeta Inicio/Fin', () => {
    const disabled = (i: number) => i === 1;
    expect(nextRovingIndex('ArrowRight', 0, 3, disabled)).toBe(2);
    expect(nextRovingIndex('Home', 2, 3, (i) => i === 0)).toBe(1);
    expect(nextRovingIndex('End', 0, 3)).toBe(2);
  });

  it('ignora otras teclas', () => {
    expect(nextRovingIndex('a', 0, 3)).toBeNull();
    expect(nextRovingIndex('Enter', 0, 3)).toBeNull();
  });
});

@Component({
  imports: [TabsComponent],
  template: `
    <ui-tabs #t [items]="items" [(active)]="active" label="Modo" />
    <div role="tabpanel" [id]="t.panelId(active())" [attr.aria-labelledby]="t.tabId(active())">panel</div>
  `,
})
class TabsHost {
  readonly items: TabItem<'a' | 'b' | 'c'>[] = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ];
  readonly active = signal<'a' | 'b' | 'c'>('a');
}

const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('TabsComponent', () => {
  it('expone tablist/tab/tabpanel enlazados y un solo tab enfocable', () => {
    const fixture = TestBed.createComponent(TabsHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    expect(el.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Modo');
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    const panel = el.querySelector('[role="tabpanel"]')!;
    expect(tabs[0].getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id);
  });

  it('las flechas cambian de pestaña y mueven el foco', () => {
    const fixture = TestBed.createComponent(TabsHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    key(el.querySelectorAll('[role="tab"]')[0], 'ArrowLeft');
    fixture.detectChanges();
    expect(fixture.componentInstance.active()).toBe('c');
    const tabs = el.querySelectorAll('[role="tab"]');
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[2]);
  });
});

@Component({
  imports: [ChoiceGroupComponent],
  template: `<ui-choice-group [options]="options" [(value)]="value" label="Talla" />`,
})
class ChoiceHost {
  readonly options: ChoiceOption[] = [
    { value: 'S', label: 'S' },
    { value: 'M', label: 'M', disabled: true },
    { value: 'L', label: 'L' },
  ];
  readonly value = signal<string | null>(null);
}

describe('ChoiceGroupComponent', () => {
  it('es un radiogroup con aria-checked y sin aria-pressed', () => {
    const fixture = TestBed.createComponent(ChoiceHost);
    fixture.componentInstance.value.set('L');
    fixture.detectChanges();
    const radios = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[role="radio"]')];
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(radios.some((r) => r.hasAttribute('aria-pressed'))).toBe(false);
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
  });

  it('las flechas seleccionan saltando la opción deshabilitada', () => {
    const fixture = TestBed.createComponent(ChoiceHost);
    fixture.componentInstance.value.set('S');
    fixture.detectChanges();
    key((fixture.nativeElement as HTMLElement).querySelectorAll('[role="radio"]')[0], 'ArrowRight');
    expect(fixture.componentInstance.value()).toBe('L');
  });

  it('sin selección, Tab entra por la primera opción habilitada', () => {
    const fixture = TestBed.createComponent(ChoiceHost);
    fixture.detectChanges();
    const radios = (fixture.nativeElement as HTMLElement).querySelectorAll('[role="radio"]');
    expect(radios[0].getAttribute('tabindex')).toBe('0');
  });
});
