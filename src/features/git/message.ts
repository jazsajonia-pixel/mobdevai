import type { FileChange } from "@/features/workspace/model";
import { diffChange } from "./diff";

/**
 * Commit message + working-branch name generated from the ACTUAL changes (and, when the changes
 * came from an AI task, that task's request). Always editable by the user before committing.
 */

const VERB: Record<FileChange["status"], string> = { added: "Add", modified: "Update", deleted: "Delete" };
const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);

function commonDir(paths: string[]): string {
  const parts = paths.map((p) => p.split("/").slice(0, -1));
  const first = parts[0] ?? [];
  let n = 0;
  while (n < first.length && parts.every((x) => x[n] === first[n])) n++;
  return first.slice(0, n).join("/");
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function clampSubject(s: string, max = 72): string {
  const one = s.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  const cap = one.charAt(0).toUpperCase() + one.slice(1);
  return cap.length <= max ? cap : `${cap.slice(0, max - 1).trimEnd()}…`;
}

export function subjectFromChanges(changes: FileChange[]): string {
  if (!changes.length) return "Update files";
  const statuses = new Set(changes.map((c) => c.status));
  const verb = statuses.size === 1 ? VERB[changes[0]!.status] : "Update";
  if (changes.length === 1) return `${verb} ${changes[0]!.path}`;
  const names = changes.map((c) => basename(c.path));
  if (changes.length <= 3 && new Set(names).size === names.length) return clampSubject(`${verb} ${listNames(names)}`);
  const dir = commonDir(changes.map((c) => c.path));
  return `${verb} ${changes.length} files${dir ? ` in ${dir}` : ""}`;
}

export function generateCommitMessage(changes: FileChange[], opts: { taskTitles?: string[] } = {}): string {
  const titles = (opts.taskTitles ?? []).map((t) => t.trim()).filter(Boolean);
  const subject = titles.length === 1 ? clampSubject(titles[0]!) : subjectFromChanges(changes);
  const lines = changes.slice(0, 25).map((c) => {
    const d = diffChange(c);
    return `- ${VERB[c.status]} ${c.path}${c.status === "modified" ? ` (+${d.added} −${d.removed})` : ""}`;
  });
  if (changes.length > 25) lines.push(`- …and ${changes.length - 25} more`);
  const body = [lines.join("\n")];
  if (titles.length) body.push(`AI task${titles.length === 1 ? "" : "s"}: ${titles.map((t) => `“${clampSubject(t, 100)}”`).join(", ")}`);
  body.push("Made with Chrono.");
  return `${subject}\n\n${body.join("\n\n")}`;
}

export const BRANCH_PREFIX = "ai/mobile-development-ai/";

export function slugify(text: string, max = 40): string {
  const s = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let cut = s.length <= max ? s : s.slice(0, max).replace(/-[^-]*$/, "") || s.slice(0, max);
  // Don't end on filler words ("…-section-to-the").
  const STOP = /-(a|an|the|to|of|and|or|for|in|on|at|with|by|from|into|so|that|this)$/;
  while (STOP.test(cut)) cut = cut.replace(STOP, "");
  return cut.replace(/-+$/, "") || "changes";
}

/** `ai/mobile-development-ai/<slug>`, suffixed -2, -3… if the name is taken. */
export function suggestBranchName(text: string, existing: Iterable<string> = []): string {
  const taken = new Set(existing);
  const base = BRANCH_PREFIX + slugify(text);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

/** Same rules the server enforces (subset of git-check-ref-format). Returns an error or null. */
export function branchNameError(name: string): string | null {
  if (!name.trim()) return "Enter a branch name.";
  if (name.length > 255) return "That name is too long.";
  if (/(\.\.|[\x00-\x20~^:?*[\\]|@\{|\/\/|^\/|\/$|\.lock$|\.$)/.test(name)) return "Branch names can't contain spaces, .., ~ ^ : ? * [ \\ or end with / or .lock.";
  return null;
}
