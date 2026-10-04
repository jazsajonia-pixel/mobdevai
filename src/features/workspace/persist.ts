import { safeStorage } from "@/lib/storage";
import type { WorkspaceData } from "./model";

/**
 * Local draft protection. Workspace changes and unsaved buffers are written to localStorage
 * (per repository + branch) so a reload, crash or dropped connection never loses work.
 * Contents never leave the device until the user commits.
 */

const PREFIX = "ws:";

export function workspaceKey(source: "demo" | "github", owner: string, repo: string, branch: string): string {
  return `${PREFIX}${source}:${owner}/${repo}@${branch}`;
}

export function loadWorkspace(key: string): WorkspaceData | null {
  try {
    const raw = safeStorage.get(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as WorkspaceData;
    if (data?.version !== 1 || typeof data.changes !== "object" || !Array.isArray(data.tabs)) return null;
    return { ...data, drafts: data.drafts ?? {} };
  } catch {
    return null;
  }
}

/** Returns false when the browser refused to store it (quota, private mode). */
export function saveWorkspace(key: string, data: WorkspaceData): boolean {
  const empty = Object.keys(data.changes).length === 0 && Object.keys(data.drafts).length === 0 && data.tabs.length === 0;
  if (empty) {
    safeStorage.remove(key);
    return true;
  }
  return safeStorage.trySet(key, JSON.stringify(data));
}

export function clearWorkspace(key: string): void {
  safeStorage.remove(key);
}
