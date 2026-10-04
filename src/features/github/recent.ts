import { safeStorage } from "@/lib/storage";

/** Recently opened repositories + last-used branch per repo (UI convenience only, not sensitive). */
export interface RecentRepo {
  owner: string;
  name: string;
  branch: string;
  openedAt: string;
}

const KEY = "recent-repos";
const MAX = 5;

export function recentRepos(): RecentRepo[] {
  try {
    const raw = safeStorage.get(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentRepo[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberRepo(owner: string, name: string, branch: string): void {
  const next = [{ owner, name, branch, openedAt: new Date().toISOString() }, ...recentRepos().filter((r) => !(r.owner === owner && r.name === name))];
  safeStorage.set(KEY, JSON.stringify(next.slice(0, MAX)));
}

export function lastBranch(owner: string, name: string): string | null {
  return recentRepos().find((r) => r.owner === owner && r.name === name)?.branch ?? null;
}

export function forgetRecent(): void {
  safeStorage.remove(KEY);
}
