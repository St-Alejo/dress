import { describe, expect, it } from 'vitest';
import {
  AddToComparisonCommand,
  ChangeSizeCommand,
  CommandHistory,
  MAX_COMPARISON_ITEMS,
  RemoveFromComparisonCommand,
  type ComparisonItem,
} from './comparison.commands';

const item = (id: string, size: string | null = 'M'): ComparisonItem => ({ garmentId: id, name: id, imageUrl: `/${id}.svg`, size });

describe('CommandHistory (patrón Command)', () => {
  it('agrega, deshace y rehace', () => {
    const h = new CommandHistory();
    h.run(new AddToComparisonCommand(item('a')));
    h.run(new AddToComparisonCommand(item('b')));
    expect(h.current.map((i) => i.garmentId)).toEqual(['a', 'b']);
    h.undo();
    expect(h.current.map((i) => i.garmentId)).toEqual(['a']);
    h.redo();
    expect(h.current.map((i) => i.garmentId)).toEqual(['a', 'b']);
  });

  it('quitar y deshacer restaura en la misma posición', () => {
    const h = new CommandHistory([item('a'), item('b'), item('c')]);
    h.run(new RemoveFromComparisonCommand('b'));
    expect(h.current.map((i) => i.garmentId)).toEqual(['a', 'c']);
    h.undo();
    expect(h.current.map((i) => i.garmentId)).toEqual(['a', 'b', 'c']);
  });

  it('cambiar talla es reversible', () => {
    const h = new CommandHistory([item('a', 'M')]);
    h.run(new ChangeSizeCommand('a', 'L'));
    expect(h.current[0].size).toBe('L');
    h.undo();
    expect(h.current[0].size).toBe('M');
  });

  it('agregar una prenda ya guardada la reemplaza, y deshacer vuelve a la anterior', () => {
    const h = new CommandHistory([item('a', 'M')]);
    h.run(new AddToComparisonCommand(item('a', 'XL')));
    expect(h.current).toHaveLength(1);
    expect(h.current[0].size).toBe('XL');
    h.undo();
    expect(h.current[0].size).toBe('M');
  });

  it('una acción nueva limpia el rehacer', () => {
    const h = new CommandHistory();
    h.run(new AddToComparisonCommand(item('a')));
    h.undo();
    expect(h.canRedo).toBe(true);
    h.run(new AddToComparisonCommand(item('b')));
    expect(h.canRedo).toBe(false);
  });

  it(`limita a ${MAX_COMPARISON_ITEMS} prendas`, () => {
    const h = new CommandHistory();
    for (const id of ['a', 'b', 'c', 'd', 'e']) h.run(new AddToComparisonCommand(item(id)));
    expect(h.current.map((i) => i.garmentId)).toEqual(['b', 'c', 'd', 'e']);
  });

  it('nunca muta el estado anterior', () => {
    const initial = [item('a')];
    const h = new CommandHistory(initial);
    h.run(new ChangeSizeCommand('a', 'S'));
    expect(initial[0].size).toBe('M');
  });
});
