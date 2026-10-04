import { structuredPatch } from "diff";
import type { FileChange } from "@/features/workspace/model";

export type DiffLineKind = "context" | "add" | "del";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  status: FileChange["status"];
  hunks: DiffHunk[];
  added: number;
  removed: number;
  /** Diff skipped because the file is huge — show counts only. */
  tooLarge: boolean;
}

const MAX_DIFF_CHARS = 400_000;

export function diffText(oldText: string, newText: string, context = 3): { hunks: DiffHunk[]; added: number; removed: number } {
  const patch = structuredPatch("a", "b", oldText, newText, undefined, undefined, { context });
  let added = 0;
  let removed = 0;
  const hunks: DiffHunk[] = patch.hunks.map((h) => {
    let o = h.oldStart;
    let n = h.newStart;
    const lines: DiffLine[] = [];
    for (const raw of h.lines) {
      const sign = raw[0];
      const text = raw.slice(1);
      if (sign === "\\") continue; // "\ No newline at end of file"
      if (sign === "+") {
        lines.push({ kind: "add", text, oldNo: null, newNo: n++ });
        added++;
      } else if (sign === "-") {
        lines.push({ kind: "del", text, oldNo: o++, newNo: null });
        removed++;
      } else {
        lines.push({ kind: "context", text, oldNo: o++, newNo: n++ });
      }
    }
    return { header: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, lines };
  });
  return { hunks, added, removed };
}

export function diffChange(change: FileChange): FileDiff {
  const oldText = change.status === "added" ? "" : (change.base ?? "");
  const newText = change.status === "deleted" ? "" : (change.content ?? "");
  if (oldText.length + newText.length > MAX_DIFF_CHARS) {
    const count = (s: string) => (s ? s.split("\n").length : 0);
    return { path: change.path, status: change.status, hunks: [], added: count(newText), removed: count(oldText), tooLarge: true };
  }
  return { path: change.path, status: change.status, tooLarge: false, ...diffText(oldText, newText) };
}

/** Pair deletions with additions for side-by-side rendering. */
export function splitRows(hunk: DiffHunk): { left: DiffLine | null; right: DiffLine | null }[] {
  const rows: { left: DiffLine | null; right: DiffLine | null }[] = [];
  let dels: DiffLine[] = [];
  let adds: DiffLine[] = [];
  const flush = () => {
    const n = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i++) rows.push({ left: dels[i] ?? null, right: adds[i] ?? null });
    dels = [];
    adds = [];
  };
  for (const line of hunk.lines) {
    if (line.kind === "del") dels.push(line);
    else if (line.kind === "add") adds.push(line);
    else {
      flush();
      rows.push({ left: line, right: line });
    }
  }
  flush();
  return rows;
}
