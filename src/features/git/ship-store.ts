import { safeStorage } from "@/lib/storage";

/**
 * Last shipping result per repository (session) — survives the branch switch that follows a
 * commit to a new branch.
 */

export interface ShipRecord {
  owner: string;
  repo: string;
  branch: string;
  /** Branch the work started on (PR base for new branches). */
  from: string;
  sha: string;
  url: string | null;
  message: string;
  files: number;
  created: boolean;
  pr: { number: number; url: string; existing: boolean } | null;
  prError: string | null;
  at: string;
}

const lastKey = (owner: string, repo: string) => `last-ship:${owner}/${repo}`;

export function saveLastShip(r: ShipRecord): void {
  safeStorage.set(lastKey(r.owner, r.repo), JSON.stringify(r), "session");
}

export function loadLastShip(owner: string, repo: string): ShipRecord | null {
  const raw = safeStorage.get(lastKey(owner, repo), "session");
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as ShipRecord;
    return typeof r.sha === "string" ? r : null;
  } catch {
    return null;
  }
}

export function clearLastShip(owner: string, repo: string): void {
  safeStorage.remove(lastKey(owner, repo), "session");
}
