/**
 * A proposal is the set of changes the agent wants to make. Write tools only ever modify the
 * proposal; the workspace changes when the user accepts files in review. Pure functions.
 */

export type Decision = "pending" | "accepted" | "rejected";

export interface ProposedFile {
  path: string;
  /** Workspace content when the agent first touched the file; null = the file didn't exist. */
  before: string | null;
  /** Proposed content; null = delete. */
  after: string | null;
  decision: Decision;
  /** Set on the new path of a rename. */
  renamedFrom?: string;
  /** Agent's reason (deletions). */
  reason?: string;
}

export type Proposal = Record<string, ProposedFile>;

export type ProposedStatus = "added" | "modified" | "deleted";

export function statusOf(f: ProposedFile): ProposedStatus {
  if (f.after === null) return "deleted";
  return f.before === null ? "added" : "modified";
}

export function proposalFiles(p: Proposal): ProposedFile[] {
  return Object.values(p).sort((a, b) => a.path.localeCompare(b.path));
}

export function pendingFiles(p: Proposal): ProposedFile[] {
  return proposalFiles(p).filter((f) => f.decision === "pending");
}

/** Record a new proposed state for `path`. `current` is the workspace content (null = missing). */
export function propose(p: Proposal, path: string, current: string | null, after: string | null, extra: Partial<ProposedFile> = {}): Proposal {
  const prev = p[path];
  const before = prev && prev.decision === "pending" ? prev.before : current;
  const next = { ...p };
  if (before === after) {
    delete next[path];
    return next;
  }
  next[path] = { path, before, after, decision: "pending", ...(prev?.renamedFrom ? { renamedFrom: prev.renamedFrom } : {}), ...extra };
  return next;
}

export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchError";
  }
}

export interface Edit {
  find: string;
  replace: string;
}

/** Apply exact find/replace edits in order; each `find` must occur exactly once. */
export function applyEdits(content: string, edits: Edit[]): string {
  let out = content;
  edits.forEach((e, i) => {
    if (!e.find) throw new PatchError(`Edit ${i + 1}: "find" is empty. To add text, include nearby existing text in "find".`);
    const first = out.indexOf(e.find);
    if (first < 0) {
      // Common model slip: whitespace differences. Report it precisely so it can retry.
      const loose = e.find.trim() && out.includes(e.find.trim()) ? " (it matches if leading/trailing whitespace is trimmed)" : "";
      throw new PatchError(`Edit ${i + 1}: "find" text was not found in the current file${loose}. Read the file again and copy the text exactly.`);
    }
    if (out.indexOf(e.find, first + 1) >= 0) throw new PatchError(`Edit ${i + 1}: "find" text appears more than once. Include more surrounding lines so it is unique.`);
    out = out.slice(0, first) + e.replace + out.slice(first + e.find.length);
  });
  return out;
}

/** Workspace content changed since the agent read it (accepting would overwrite the user's edit). */
export function hasConflict(f: ProposedFile, currentNow: string | null): boolean {
  return f.before !== currentNow;
}

export function setDecision(p: Proposal, paths: string[], decision: Decision): Proposal {
  const next = { ...p };
  for (const path of paths) {
    const f = next[path];
    if (f) next[path] = { ...f, decision };
  }
  return next;
}
