import { safeStorage } from "@/lib/storage";
import { compactForStorage, type AgentTask, type ShippedInfo } from "./task";

/**
 * Agent tasks are kept per repo + branch on this device (localStorage). They hold conversation
 * text, tool logs and proposed file contents — never API keys (those stay on the server).
 * Key deliberately does NOT end with the workspace key, so workspace storage listeners ignore it.
 */
const MAX_TASKS = 15;

export function tasksKey(workspaceKey: string): string {
  return `agent-tasks:${workspaceKey}:v1`;
}

export function loadTasks(workspaceKey: string): AgentTask[] {
  const raw = safeStorage.get(tasksKey(workspaceKey));
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as AgentTask[];
    if (!Array.isArray(list)) return [];
    // A run can't survive a reload; show it as stopped so the user can continue.
    return list.map((t) => (t.status === "running" ? { ...t, status: "stopped" as const } : t));
  } catch {
    return [];
  }
}

export function saveTasks(workspaceKey: string, tasks: AgentTask[]): boolean {
  // Shipping info is written from the Git tab; never let an in-memory copy without it erase it.
  const shipped = new Map(loadTasks(workspaceKey).flatMap((t) => (t.shipped ? [[t.id, t.shipped] as const] : [])));
  const list = tasks
    .map((t) => (t.shipped || !shipped.has(t.id) ? t : { ...t, shipped: shipped.get(t.id) })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_TASKS).map(compactForStorage);
  try {
    // trySet reports quota failures instead of silently falling back to memory.
    return safeStorage.trySet(tasksKey(workspaceKey), JSON.stringify(list));
  } catch {
    return false;
  }
}

export interface RecentTask {
  source: "demo" | "github";
  owner: string;
  repo: string;
  branch: string;
  /** Workspace key the task is stored under. */
  key: string;
  task: AgentTask;
}

/** Latest tasks across all workspaces on this device (for the AI page). */
export function recentAgentTasks(limit = 8): RecentTask[] {
  const out: RecentTask[] = [];
  let keys: string[] = [];
  try {
    keys = Object.keys(window.localStorage);
  } catch {
    return out;
  }
  for (const k of keys) {
    const m = /^mdai:agent-tasks:.*?(demo|github):([^/]+)\/([^@]+)@(.+):v1$/.exec(k);
    if (!m) continue;
    const wsKey = k.slice("mdai:agent-tasks:".length, -":v1".length);
    for (const task of loadTasks(wsKey)) out.push({ source: m[1] as "demo" | "github", owner: m[2]!, repo: m[3]!, branch: m[4]!, key: wsKey, task });
  }
  return out.sort((a, b) => b.task.updatedAt.localeCompare(a.task.updatedAt)).slice(0, limit);
}

/** Tasks whose accepted changes touch any of `paths` and that haven't been shipped yet. */
export function tasksForPaths(workspaceKey: string, paths: readonly string[]): AgentTask[] {
  const set = new Set(paths);
  return loadTasks(workspaceKey).filter((t) => !t.shipped && Object.values(t.proposal).some((f) => f.decision === "accepted" && set.has(f.path)));
}

/** Record commit/PR information on the tasks that produced the committed changes. */
export function markTasksShipped(workspaceKey: string, taskIds: readonly string[], info: ShippedInfo): void {
  if (!taskIds.length) return;
  const ids = new Set(taskIds);
  const list = loadTasks(workspaceKey).map((t) => (ids.has(t.id) ? { ...t, shipped: info } : t));
  saveTasks(workspaceKey, list);
}

/** Remove one task from this device's history. */
export function deleteTask(workspaceKey: string, taskId: string): void {
  const list = loadTasks(workspaceKey).filter((t) => t.id !== taskId);
  if (list.length) saveTasks(workspaceKey, list);
  else safeStorage.remove(tasksKey(workspaceKey));
}
