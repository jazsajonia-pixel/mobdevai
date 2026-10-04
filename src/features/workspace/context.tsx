import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EditorStateCache } from "@/features/editor/state-cache";
import {
  changeList,
  createFile as createFileModel,
  deleteFile as deleteFileModel,
  effectivePaths,
  emptyWorkspace,
  exists,
  openTab as openTabModel,
  closeTab as closeTabModel,
  renameFile as renameFileModel,
  revertAll as revertAllModel,
  revertFile as revertFileModel,
  saveFile as saveFileModel,
  savedContent,
  setDraft as setDraftModel,
  normalizePath,
  type FileChange,
  type WorkspaceData,
} from "./model";
import { loadWorkspace, saveWorkspace } from "./persist";

export interface WorkspaceSource {
  /** Storage key (repo + branch). Changing it swaps to a different workspace. */
  storageKey: string;
  /** Commit sha of the base snapshot. */
  commitSha: string;
  basePaths: readonly string[];
  /** Base sizes in bytes when known (used to skip huge files in project search). */
  baseSizes?: ReadonlyMap<string, number>;
  /** Load a file's base content. Rejects with ApiError for binary / too large / missing. */
  loadBase: (path: string) => Promise<string>;
  /** GitHub returned a partial tree. */
  truncated?: boolean;
  /** Link to the file on GitHub (not for demo). */
  githubUrl?: (path: string) => string;
}

export interface JumpTarget {
  path: string;
  line: number;
  /** Bumps so the same target can be jumped to twice. */
  nonce: number;
}

interface WorkspaceValue {
  source: WorkspaceSource;
  data: WorkspaceData;
  paths: string[];
  changes: FileChange[];
  /** The branch moved on GitHub after these changes were made. */
  baseMoved: boolean;
  /** False when the browser refused to persist drafts (quota / private mode). */
  storageOk: boolean;
  exists: (path: string) => boolean;
  /** Content at the base commit, or null if the file isn't in the base. */
  getBase: (path: string) => Promise<string | null>;
  /** Cached base content if already loaded (sync). */
  peekBase: (path: string) => string | undefined;
  /** Saved workspace content (changes over base). */
  getSaved: (path: string) => Promise<string>;
  /** What the editor should show: unsaved draft → saved → base. */
  getBuffer: (path: string) => Promise<string>;
  /** Sync variant for search: undefined when not loaded yet. */
  peekBuffer: (path: string) => string | undefined;
  openFile: (path: string, line?: number) => void;
  closeFile: (path: string) => void;
  /** Record the editor buffer; drops the draft when it matches the saved content. */
  updateDraft: (path: string, content: string) => void;
  save: (path: string, content: string) => Promise<void>;
  create: (path: string, content?: string) => string;
  remove: (path: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<string>;
  revert: (path: string) => void;
  revertAll: () => void;
  jump: JumpTarget | null;
  /** Per-file editor states (keeps undo history across tab switches). Invalidated on revert/rename/delete. */
  editorStates: EditorStateCache;
}

const Ctx = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return v;
}

/** Optional variant for components that render both inside and outside a workspace. */
export function useOptionalWorkspace(): WorkspaceValue | null {
  return useContext(Ctx);
}

function initial(source: WorkspaceSource): { data: WorkspaceData; baseMoved: boolean } {
  const stored = loadWorkspace(source.storageKey);
  if (!stored) return { data: emptyWorkspace(source.commitSha), baseMoved: false };
  const hasWork = Object.keys(stored.changes).length > 0 || Object.keys(stored.drafts).length > 0;
  if (stored.baseSha === source.commitSha) return { data: stored, baseMoved: false };
  if (!hasWork) {
    // Nothing to protect — adopt the new base, keep tabs that still exist.
    const base = new Set(source.basePaths);
    const tabs = stored.tabs.filter((t) => base.has(t));
    return { data: { ...emptyWorkspace(source.commitSha), tabs, active: tabs.includes(stored.active ?? "") ? stored.active : (tabs[0] ?? null) }, baseMoved: false };
  }
  return { data: stored, baseMoved: true };
}

export function WorkspaceProvider({ source, children }: { source: WorkspaceSource; children: ReactNode }) {
  const [state, setState] = useState(() => initial(source));
  const [storageOk, setStorageOk] = useState(true);
  const [jump, setJump] = useState<JumpTarget | null>(null);
  const baseCache = useRef(new Map<string, string>());
  const editorStates = useRef(new EditorStateCache());
  const dataRef = useRef(state.data);

  const basePathSet = useMemo(() => new Set(source.basePaths), [source.basePaths]);

  // Persist (debounced) + flush when the page is hidden or the workspace unmounts
  // (the parent keys this provider by storageKey + commit, so a branch switch remounts it).
  const key = source.storageKey;
  const mounted = useRef(true);
  // Only write when something changed since the last write/read, so an idle tab never clobbers
  // work saved by another tab.
  const lastWritten = useRef<WorkspaceData>(state.data);
  const persist = useCallback(
    (data: WorkspaceData) => {
      if (data === lastWritten.current) return true;
      lastWritten.current = data;
      return saveWorkspace(key, data);
    },
    [key],
  );
  useEffect(() => {
    const t = setTimeout(() => setStorageOk(persist(state.data)), 400);
    return () => clearTimeout(t);
  }, [persist, state.data]);
  useEffect(() => {
    mounted.current = true;
    const flush = () => persist(dataRef.current);
    const onVis = () => document.visibilityState === "hidden" && flush();
    // Another tab edited the same repo + branch: adopt its state.
    const onStorage = (e: StorageEvent) => {
      if (!e.key?.endsWith(key)) return;
      const incoming = loadWorkspace(key) ?? emptyWorkspace(source.commitSha);
      lastWritten.current = incoming;
      dataRef.current = incoming;
      editorStates.current.clear();
      setState((s) => ({ ...s, data: incoming }));
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, persist]);

  const update = useCallback(
    (fn: (d: WorkspaceData) => WorkspaceData) => {
      const next = fn(dataRef.current);
      if (next === dataRef.current) return;
      dataRef.current = next;
      // Late updates (e.g. an editor flushing its draft while unmounting) are written straight through.
      if (!mounted.current) persist(next);
      else setState((s) => ({ ...s, data: next }));
    },
    [persist],
  );

  const peekBase = useCallback(
    (path: string): string | undefined => {
      const c = dataRef.current.changes[path];
      if (c?.base !== undefined) return c.base;
      return baseCache.current.get(path);
    },
    [],
  );

  const getBase = useCallback(
    async (path: string): Promise<string | null> => {
      const hit = peekBase(path);
      if (hit !== undefined) return hit;
      if (!basePathSet.has(path)) return null;
      const content = await source.loadBase(path);
      baseCache.current.set(path, content);
      return content;
    },
    [basePathSet, peekBase, source],
  );

  const getSaved = useCallback(
    async (path: string): Promise<string> => {
      const saved = savedContent(dataRef.current, path);
      if (saved !== undefined) return saved;
      return (await getBase(path)) ?? "";
    },
    [getBase],
  );

  const getBuffer = useCallback(
    async (path: string): Promise<string> => {
      const draft = dataRef.current.drafts[path];
      return draft ?? getSaved(path);
    },
    [getSaved],
  );

  const peekBuffer = useCallback(
    (path: string): string | undefined => {
      const d = dataRef.current;
      return d.drafts[path] ?? savedContent(d, path) ?? (exists(basePathSet, d, path) ? baseCache.current.get(path) : undefined);
    },
    [basePathSet],
  );

  const value = useMemo<WorkspaceValue>(() => {
    const data = state.data;
    return {
      source,
      data,
      paths: effectivePaths(source.basePaths, data),
      changes: changeList(data),
      baseMoved: state.baseMoved,
      storageOk,
      exists: (p) => exists(basePathSet, dataRef.current, p),
      getBase,
      peekBase,
      getSaved,
      getBuffer,
      peekBuffer,
      editorStates: editorStates.current,
      jump,
      openFile: (path, line) => {
        update((d) => openTabModel(d, path));
        if (line) setJump((j) => ({ path, line, nonce: (j?.nonce ?? 0) + 1 }));
      },
      closeFile: (path) => {
        editorStates.current.invalidate(path);
        update((d) => closeTabModel(d, path));
      },
      updateDraft: (path, content) =>
        update((d) => {
          const saved = savedContent(d, path) ?? peekBase(path);
          // Base not loaded yet (shouldn't happen while editing) — keep the draft to be safe.
          return setDraftModel(d, path, content, saved ?? "\u0000");
        }),
      save: async (path, content) => {
        const base = await getBase(path).catch(() => null);
        // A file that exists in base but whose base failed to load can't be compared — treat as modified.
        const inBase = basePathSet.has(path) && !(dataRef.current.changes[path]?.status === "added");
        update((d) => saveFileModel(d, path, content, base ?? (inBase ? "" : null)));
      },
      create: (raw, content = "") => {
        // Validate synchronously so the caller can show the error inline.
        const next = createFileModel(dataRef.current, basePathSet, raw, content);
        const path = next.active!;
        editorStates.current.invalidate(path);
        update(() => next);
        return path;
      },
      remove: async (path) => {
        const base = basePathSet.has(path) || dataRef.current.changes[path]?.status === "deleted" ? await getBase(path).catch(() => "") : null;
        const added = dataRef.current.changes[path]?.status === "added" && !basePathSet.has(path);
        editorStates.current.invalidate(path);
        update((d) => deleteFileModel(d, path, added ? null : base));
      },
      rename: async (from, rawTo) => {
        const to = normalizePath(rawTo);
        const content = await getBuffer(from);
        const addedOnly = dataRef.current.changes[from]?.status === "added" && !basePathSet.has(from);
        const baseFrom = addedOnly ? null : await getBase(from).catch(() => "");
        const baseTo = basePathSet.has(to) ? await getBase(to).catch(() => "") : null;
        const next = renameFileModel(dataRef.current, basePathSet, from, to, content, baseFrom, baseTo);
        editorStates.current.invalidate(from);
        editorStates.current.invalidate(to);
        update(() => next);
        return to;
      },
      revert: (path) => {
        editorStates.current.invalidate(path);
        update((d) => revertFileModel(d, path));
      },
      revertAll: () => {
        editorStates.current.clear();
        update((d) => revertAllModel(d));
        setState((s) => ({ ...s, baseMoved: false }));
      },
    };
  }, [state, storageOk, source, basePathSet, getBase, peekBase, getSaved, getBuffer, peekBuffer, update, jump]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
