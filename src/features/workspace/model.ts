/**
 * Workspace model — pure functions, no React. A workspace is a set of local changes layered on
 * top of a base snapshot (a GitHub commit or the bundled demo). Nothing here talks to GitHub;
 * changes stay on the device until they're committed (Phase 6).
 *
 * Three layers per file:
 *   base       content at the branch's commit (GitHub / demo)
 *   change     saved workspace content — what will be committed
 *   draft      unsaved editor buffer — protected locally, shown with an "unsaved" dot
 * Renames are modelled like git: delete old path + add new path.
 */

export type ChangeStatus = "added" | "modified" | "deleted";

export interface FileChange {
  path: string;
  status: ChangeStatus;
  /** New content (added / modified). */
  content?: string;
  /** Base content (modified / deleted) so diffs work offline and after reload. */
  base?: string;
}

export interface WorkspaceData {
  version: 1;
  /** Commit the changes were made on top of. */
  baseSha: string;
  changes: Record<string, FileChange>;
  drafts: Record<string, string>;
  tabs: string[];
  active: string | null;
}

export function emptyWorkspace(baseSha: string): WorkspaceData {
  return { version: 1, baseSha, changes: {}, drafts: {}, tabs: [], active: null };
}

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

/* ── Paths ─────────────────────────────────────────────────────────── */

const BAD_CHARS = /[\x00-\x1f\\:*?"<>|]/;

/** Normalise and validate a user-typed repository path. Throws WorkspaceError with a readable reason. */
export function normalizePath(input: string): string {
  const path = input.trim().replace(/^\.?\/+/, "").replace(/\/{2,}/g, "/");
  if (!path) throw new WorkspaceError("Enter a file name.");
  if (path.endsWith("/")) throw new WorkspaceError("Path must end with a file name, not a folder.");
  if (path.length > 1024) throw new WorkspaceError("Path is too long.");
  const parts = path.split("/");
  if (parts.some((p) => p === "." || p === "..")) throw new WorkspaceError("Paths can't contain . or .. segments.");
  if (parts.some((p) => BAD_CHARS.test(p))) throw new WorkspaceError('Paths can\'t contain control characters or \\ : * ? " < > |.');
  if (parts[0] === ".git") throw new WorkspaceError("The .git folder can't be edited.");
  return path;
}

/* ── Queries ───────────────────────────────────────────────────────── */

/** Files that exist in the workspace right now (base − deleted + added), sorted. */
export function effectivePaths(basePaths: readonly string[], ws: WorkspaceData): string[] {
  const out = new Set(basePaths);
  for (const c of Object.values(ws.changes)) {
    if (c.status === "deleted") out.delete(c.path);
    else out.add(c.path);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

export function exists(basePaths: ReadonlySet<string>, ws: WorkspaceData, path: string): boolean {
  const c = ws.changes[path];
  if (c) return c.status !== "deleted";
  return basePaths.has(path);
}

/** Saved workspace content if the file was changed locally, otherwise undefined (use base). */
export function savedContent(ws: WorkspaceData, path: string): string | undefined {
  const c = ws.changes[path];
  return c && c.status !== "deleted" ? c.content : undefined;
}

export function changeList(ws: WorkspaceData): FileChange[] {
  return Object.values(ws.changes).sort((a, b) => a.path.localeCompare(b.path));
}

export function isDirty(ws: WorkspaceData, path: string): boolean {
  return path in ws.drafts;
}

/* ── Mutations (immutable) ────────────────────────────────────────── */

/**
 * Save `content` for `path`. `base` is the file's content at the base commit, or null if the
 * file doesn't exist there. Saving content identical to base removes the change.
 */
export function saveFile(ws: WorkspaceData, path: string, content: string, base: string | null): WorkspaceData {
  const changes = { ...ws.changes };
  const drafts = { ...ws.drafts };
  delete drafts[path];
  if (base === null) changes[path] = { path, status: "added", content };
  else if (content === base) delete changes[path];
  else changes[path] = { path, status: "modified", content, base };
  return { ...ws, changes, drafts };
}

export function setDraft(ws: WorkspaceData, path: string, content: string, saved: string): WorkspaceData {
  const drafts = { ...ws.drafts };
  if (content === saved) delete drafts[path];
  else drafts[path] = content;
  return { ...ws, drafts };
}

export function createFile(ws: WorkspaceData, basePaths: ReadonlySet<string>, rawPath: string, content = ""): WorkspaceData {
  const path = normalizePath(rawPath);
  if (exists(basePaths, ws, path)) throw new WorkspaceError(`${path} already exists.`);
  const folderClash = [...basePaths, ...Object.keys(ws.changes)].some((p) => p.startsWith(`${path}/`));
  if (folderClash) throw new WorkspaceError(`${path} is a folder.`);
  // Re-creating a file deleted from base is a modification of that base file.
  const prev = ws.changes[path];
  const base = prev?.status === "deleted" ? (prev.base ?? "") : null;
  return openTab(saveFile(ws, path, content, base), path);
}

/** Delete a file. `base` is its base content (null if it never existed in base). */
export function deleteFile(ws: WorkspaceData, path: string, base: string | null): WorkspaceData {
  const changes = { ...ws.changes };
  const drafts = { ...ws.drafts };
  delete drafts[path];
  if (base === null) delete changes[path];
  else changes[path] = { path, status: "deleted", base };
  return closeTab({ ...ws, changes, drafts }, path);
}

/** Rename/move. `content` is the current content of `from`; bases are the base contents (or null). */
export function renameFile(
  ws: WorkspaceData,
  basePaths: ReadonlySet<string>,
  from: string,
  rawTo: string,
  content: string,
  baseFrom: string | null,
  baseTo: string | null,
): WorkspaceData {
  const to = normalizePath(rawTo);
  if (to === from) return ws;
  if (exists(basePaths, ws, to)) throw new WorkspaceError(`${to} already exists.`);
  const wasActive = ws.active === from;
  const tabIndex = ws.tabs.indexOf(from);
  let next = deleteFile(ws, from, baseFrom);
  const prevTo = next.changes[to];
  const toBase = prevTo?.status === "deleted" ? (prevTo.base ?? null) : baseTo;
  next = saveFile(next, to, content, toBase);
  if (tabIndex >= 0) {
    const tabs = [...next.tabs];
    tabs.splice(Math.min(tabIndex, tabs.length), 0, to);
    next = { ...next, tabs, active: wasActive ? to : next.active };
  }
  return next;
}

/** Throw away saved changes and drafts for one file. */
export function revertFile(ws: WorkspaceData, path: string): WorkspaceData {
  const changes = { ...ws.changes };
  const drafts = { ...ws.drafts };
  const c = changes[path];
  delete changes[path];
  delete drafts[path];
  const next = { ...ws, changes, drafts };
  return c?.status === "added" ? closeTab(next, path) : next;
}

export function revertAll(ws: WorkspaceData): WorkspaceData {
  const added = new Set(Object.values(ws.changes).filter((c) => c.status === "added").map((c) => c.path));
  const tabs = ws.tabs.filter((t) => !added.has(t));
  return { ...ws, changes: {}, drafts: {}, tabs, active: ws.active && added.has(ws.active) ? (tabs[0] ?? null) : ws.active };
}

/**
 * After a commit: the committed files are now part of the branch, so drop their local changes
 * (keeping tabs open, except for deleted files). With `newBaseSha` the remaining changes are
 * re-based onto the new commit — only valid when nothing else changed upstream.
 */
export function afterCommit(ws: WorkspaceData, committed: readonly string[], newBaseSha: string | null): WorkspaceData {
  const changes = { ...ws.changes };
  const drafts = { ...ws.drafts };
  const deleted = new Set<string>();
  for (const p of committed) {
    if (changes[p]?.status === "deleted") deleted.add(p);
    delete changes[p];
    delete drafts[p];
  }
  const tabs = ws.tabs.filter((t) => !deleted.has(t));
  return { ...ws, baseSha: newBaseSha ?? ws.baseSha, changes, drafts, tabs, active: ws.active && deleted.has(ws.active) ? (tabs[0] ?? null) : ws.active };
}

export const MAX_TABS = 8;

export function openTab(ws: WorkspaceData, path: string): WorkspaceData {
  if (ws.tabs.includes(path)) return { ...ws, active: path };
  let tabs = [...ws.tabs, path];
  // Keep phones manageable: drop the oldest clean tab when over the limit.
  while (tabs.length > MAX_TABS) {
    const victim = tabs.find((t) => t !== path && !(t in ws.drafts));
    if (!victim) break;
    tabs = tabs.filter((t) => t !== victim);
  }
  return { ...ws, tabs, active: path };
}

export function closeTab(ws: WorkspaceData, path: string): WorkspaceData {
  const i = ws.tabs.indexOf(path);
  if (i < 0) return ws;
  const tabs = ws.tabs.filter((t) => t !== path);
  const active = ws.active === path ? (tabs[Math.min(i, tabs.length - 1)] ?? null) : ws.active;
  return { ...ws, tabs, active };
}
