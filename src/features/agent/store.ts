import { safeStorage } from "@/lib/storage";
import { compactForStorage, type AgentTask } from "./task";

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
  const list = [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_TASKS).map(compactForStorage);
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
    for (const task of loadTasks(wsKey)) out.push({ source: m[1] as "demo" | "github", owner: m[2]!, repo: m[3]!, branch: m[4]!, task });
  }
  return out.sort((a, b) => b.task.updatedAt.localeCompare(a.task.updatedAt)).slice(0, limit);
}
