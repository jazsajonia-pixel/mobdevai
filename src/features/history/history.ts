import { splitUserMessage, type AgentTask } from "@/features/agent/task";
import type { RecentTask } from "@/features/agent/store";
import { proposalFiles, type ProposedFile } from "@/features/agent/proposal";

/** History view of an agent task: everything the task list and detail sheet show. */
export type HistoryStatus = "in_progress" | "needs_review" | "done" | "shipped" | "failed";

export const HISTORY_STATUS_LABEL: Record<HistoryStatus, string> = {
  in_progress: "In progress",
  needs_review: "Needs review",
  done: "Done",
  shipped: "Shipped",
  failed: "Stopped / failed",
};

export interface HistoryEntry {
  ref: RecentTask;
  prompt: string;
  /** Files the user attached to the prompt (content not shown). */
  attached: string[];
  result: string | null;
  files: ProposedFile[];
  status: HistoryStatus;
}

export function historyStatus(t: AgentTask): HistoryStatus {
  if (t.shipped) return "shipped";
  if (t.status === "running" || t.status === "awaiting_plan" || t.status === "idle") return "in_progress";
  if (t.status === "error" || t.status === "stopped" || t.status === "step_limit") return "failed";
  if (proposalFiles(t.proposal).some((f) => f.decision === "pending")) return "needs_review";
  return "done";
}

export function toHistoryEntry(ref: RecentTask): HistoryEntry {
  const t = ref.task;
  const firstUser = t.messages.find((m) => m.role === "user");
  let result: string | null = null;
  for (let i = t.messages.length - 1; i >= 0; i--) {
    const m = t.messages[i]!;
    if (m.role === "assistant" && m.content.trim()) {
      result = m.content.trim();
      break;
    }
  }
  if (!result && t.error) result = t.error.message;
  const split = firstUser ? splitUserMessage(firstUser.content) : { text: t.title, files: [] };
  return { ref, prompt: split.text, attached: split.files, result, files: proposalFiles(t.proposal), status: historyStatus(t) };
}

export interface HistoryFilter {
  query?: string;
  status?: HistoryStatus | "all";
  repo?: string | null; // "owner/repo"
}

export function filterHistory(entries: readonly HistoryEntry[], f: HistoryFilter): HistoryEntry[] {
  const q = f.query?.trim().toLowerCase() ?? "";
  return entries.filter((e) => {
    if (f.status && f.status !== "all" && e.status !== f.status) return false;
    if (f.repo && `${e.ref.owner}/${e.ref.repo}` !== f.repo) return false;
    if (!q) return true;
    const hay = [e.prompt, e.ref.task.title, e.ref.owner, e.ref.repo, e.ref.branch, ...e.files.map((x) => x.path)].join("\n").toLowerCase();
    return hay.includes(q);
  });
}

export function repoOptions(entries: readonly HistoryEntry[]): string[] {
  return [...new Set(entries.map((e) => `${e.ref.owner}/${e.ref.repo}`))].sort();
}
