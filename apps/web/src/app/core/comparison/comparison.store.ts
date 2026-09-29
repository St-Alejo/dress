import { Injectable, computed, signal } from '@angular/core';
import { localPrefs } from '../local-prefs';
import {
  AddToComparisonCommand,
  ChangeSizeCommand,
  CommandHistory,
  RemoveFromComparisonCommand,
  type ComparisonCommand,
  type ComparisonItem,
} from './comparison.commands';

const KEY = 'comparison';

/** Guardar y comparar prendas (paso 8) sin repetir la captura. */
@Injectable({ providedIn: 'root' })
export class ComparisonStore {
  private readonly history = new CommandHistory(localPrefs.read<ComparisonItem[]>(KEY, []));
  private readonly version = signal(0);

  readonly items = computed(() => (this.version(), this.history.current));
  readonly count = computed(() => this.items().length);
  readonly canUndo = computed(() => (this.version(), this.history.canUndo));
  readonly canRedo = computed(() => (this.version(), this.history.canRedo));
  readonly lastLabel = computed(() => (this.version(), this.history.lastLabel));

  has(garmentId: string) {
    return this.items().some((i) => i.garmentId === garmentId);
  }

  add(item: ComparisonItem) {
    this.run(new AddToComparisonCommand(item));
  }
  remove(garmentId: string) {
    this.run(new RemoveFromComparisonCommand(garmentId));
  }
  changeSize(garmentId: string, size: string) {
    this.run(new ChangeSizeCommand(garmentId, size));
  }
  undo() {
    this.history.undo();
    this.commit();
  }
  redo() {
    this.history.redo();
    this.commit();
  }

  private run(cmd: ComparisonCommand) {
    this.history.run(cmd);
    this.commit();
  }

  private commit() {
    localPrefs.write(KEY, this.history.current);
    this.version.update((v) => v + 1);
  }
}
