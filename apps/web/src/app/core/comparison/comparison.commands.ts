/**
 * Patrón Command (sección 10): cada cambio a la comparación es un objeto que
 * sabe aplicarse y deshacerse, así la persona puede experimentar sin miedo.
 */
export interface ComparisonItem {
  garmentId: string;
  name: string;
  brandName?: string;
  imageUrl: string;
  size: string | null;
  sessionId?: string;
}

export type ComparisonState = readonly ComparisonItem[];

export interface ComparisonCommand {
  readonly label: string;
  execute(state: ComparisonState): ComparisonState;
  undo(state: ComparisonState): ComparisonState;
}

export const MAX_COMPARISON_ITEMS = 4;

export class AddToComparisonCommand implements ComparisonCommand {
  readonly label = 'compare.cmd.add';
  private replaced?: ComparisonItem;
  private index = -1;

  constructor(private readonly item: ComparisonItem) {}

  execute(state: ComparisonState): ComparisonState {
    this.index = state.findIndex((i) => i.garmentId === this.item.garmentId);
    if (this.index >= 0) {
      this.replaced = state[this.index];
      return state.map((i, k) => (k === this.index ? this.item : i));
    }
    return [...state, this.item].slice(-MAX_COMPARISON_ITEMS);
  }

  undo(state: ComparisonState): ComparisonState {
    if (this.replaced) return state.map((i) => (i.garmentId === this.item.garmentId ? this.replaced! : i));
    return state.filter((i) => i.garmentId !== this.item.garmentId);
  }
}

export class RemoveFromComparisonCommand implements ComparisonCommand {
  readonly label = 'compare.cmd.remove';
  private removed?: ComparisonItem;
  private index = -1;

  constructor(private readonly garmentId: string) {}

  execute(state: ComparisonState): ComparisonState {
    this.index = state.findIndex((i) => i.garmentId === this.garmentId);
    if (this.index < 0) return state;
    this.removed = state[this.index];
    return state.filter((_, k) => k !== this.index);
  }

  undo(state: ComparisonState): ComparisonState {
    if (!this.removed) return state;
    const next = [...state];
    next.splice(this.index, 0, this.removed);
    return next;
  }
}

export class ChangeSizeCommand implements ComparisonCommand {
  readonly label = 'compare.cmd.size';
  private previous: string | null = null;

  constructor(
    private readonly garmentId: string,
    private readonly size: string,
  ) {}

  execute(state: ComparisonState): ComparisonState {
    return state.map((i) => {
      if (i.garmentId !== this.garmentId) return i;
      this.previous = i.size;
      return { ...i, size: this.size };
    });
  }

  undo(state: ComparisonState): ComparisonState {
    return state.map((i) => (i.garmentId === this.garmentId ? { ...i, size: this.previous } : i));
  }
}

/** Historial con deshacer/rehacer. Estado inmutable: cada paso produce un arreglo nuevo. */
export class CommandHistory {
  private done: ComparisonCommand[] = [];
  private undone: ComparisonCommand[] = [];

  constructor(private state: ComparisonState = []) {}

  get current(): ComparisonState {
    return this.state;
  }
  get canUndo() {
    return this.done.length > 0;
  }
  get canRedo() {
    return this.undone.length > 0;
  }
  get lastLabel(): string | null {
    return this.done.at(-1)?.label ?? null;
  }

  run(cmd: ComparisonCommand): ComparisonState {
    this.state = cmd.execute(this.state);
    this.done.push(cmd);
    this.undone = [];
    return this.state;
  }

  undo(): ComparisonState {
    const cmd = this.done.pop();
    if (cmd) {
      this.state = cmd.undo(this.state);
      this.undone.push(cmd);
    }
    return this.state;
  }

  redo(): ComparisonState {
    const cmd = this.undone.pop();
    if (cmd) {
      this.state = cmd.execute(this.state);
      this.done.push(cmd);
    }
    return this.state;
  }
}
