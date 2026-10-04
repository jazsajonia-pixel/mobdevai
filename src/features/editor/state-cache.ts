import type { EditorState } from "@codemirror/state";

/**
 * Per-file editor states (keeps undo history across tab switches). Invalidating a path bumps its
 * epoch so an editor still showing the old state can't write it back (e.g. after revert/rename).
 */
export class EditorStateCache {
  private states = new Map<string, { state: EditorState; epoch: number }>();
  private epochs = new Map<string, number>();
  private generation = 0;

  epoch(path: string): number {
    return (this.epochs.get(path) ?? 0) + this.generation * 1_000_000;
  }

  get(path: string): EditorState | undefined {
    const hit = this.states.get(path);
    return hit && hit.epoch === this.epoch(path) ? hit.state : undefined;
  }

  has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  /** Stores only if nothing invalidated the path since `epoch` was read. */
  set(path: string, state: EditorState, epoch: number): void {
    if (epoch === this.epoch(path)) this.states.set(path, { state, epoch });
  }

  invalidate(path: string): void {
    this.states.delete(path);
    this.epochs.set(path, (this.epochs.get(path) ?? 0) + 1);
  }

  clear(): void {
    this.states.clear();
    this.generation++;
  }
}
