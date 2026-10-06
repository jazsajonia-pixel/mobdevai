import { useSyncExternalStore } from "react";

/**
 * Tiny global store for the command palette: open state plus a registry where the open
 * workspace publishes its file list (so ⌘K can jump to files without importing workspace code).
 */

export interface PaletteFiles {
  /** e.g. "octo/app@main" — shown as the group label. */
  label: string;
  paths: readonly string[];
  open: (path: string) => void;
}

type State = { open: boolean; files: PaletteFiles | null };

let state: State = { open: false, files: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  emit();
};

export const openCommandPalette = () => set({ open: true });
export const closeCommandPalette = () => set({ open: false });
export const toggleCommandPalette = () => set({ open: !state.open });

/** Returns an unregister function. Only the latest registration is kept. */
export function registerPaletteFiles(files: PaletteFiles): () => void {
  set({ files });
  return () => {
    if (state.files === files) set({ files: null });
  };
}

export function usePaletteState(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/* "New repository" can be requested from anywhere; the projects page consumes it. */
let newRepoRequested = false;
const newRepoListeners = new Set<() => void>();
export function requestNewRepo(): void {
  newRepoRequested = true;
  newRepoListeners.forEach((l) => l());
}
/** Returns true once per request. */
export function takeNewRepoRequest(): boolean {
  const v = newRepoRequested;
  newRepoRequested = false;
  return v;
}
export function onNewRepoRequest(l: () => void): () => void {
  newRepoListeners.add(l);
  return () => newRepoListeners.delete(l);
}
