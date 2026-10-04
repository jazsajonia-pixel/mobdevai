import { HttpError } from "./http";
import type { BranchSummary, RepoSummary, SessionUser, TreeEntry } from "../../src/types/github";

/**
 * Minimal GitHub REST client used by functions. Translates GitHub failures into our error codes
 * with messages a developer can act on. Upstream response bodies are never forwarded verbatim.
 */

export const API_VERSION = "2022-11-28";

export interface GitHubClient {
  get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<{ data: T; headers: Headers }>;
}

export function githubClient(token: string, apiUrl: string, fetchImpl: typeof fetch = fetch): GitHubClient {
  return {
    async get<T>(path: string, query?: Record<string, string | number | undefined>) {
      const url = new URL(apiUrl + path);
      for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
      let res: Response;
      try {
        res = await fetchImpl(url, {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "mobile-development-ai",
          },
          signal: AbortSignal.timeout(12_000),
        });
      } catch {
        throw new HttpError(502, "GITHUB_UNAVAILABLE", "Couldn't reach GitHub.");
      }
      if (!res.ok) throw await toHttpError(res);
      return { data: (await res.json()) as T, headers: res.headers };
    },
  };
}

export async function toHttpError(res: Response): Promise<HttpError> {
  let message = "";
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === "string") message = body.message.slice(0, 200);
  } catch {
    /* ignore */
  }
  const remaining = res.headers.get("x-ratelimit-remaining");
  if (res.status === 429 || (res.status === 403 && remaining === "0") || /rate limit/i.test(message)) {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const mins = Number.isFinite(reset) && reset > 0 ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000)) : null;
    return new HttpError(429, "RATE_LIMITED", mins ? `GitHub rate limit reached. Resets in about ${mins} min.` : "GitHub rate limit reached.");
  }
  if (res.status === 401) return new HttpError(401, "SESSION_EXPIRED", "GitHub rejected the session token. Sign in again.");
  if (res.status === 403) {
    return new HttpError(403, "FORBIDDEN", /SAML|organization/i.test(message)
      ? "This organization requires you to authorize the app (SAML SSO or OAuth app restrictions)."
      : "Your GitHub account doesn't have permission for this.");
  }
  if (res.status === 404) {
    return new HttpError(404, "NOT_FOUND", "Not found on GitHub — or it's private and the app wasn't granted private repository access.");
  }
  if (res.status === 409 && /empty/i.test(message)) return new HttpError(409, "EMPTY_REPOSITORY", "This repository has no commits yet.");
  if (res.status === 422) return new HttpError(422, "VALIDATION_FAILED", message || "GitHub rejected the request.");
  return new HttpError(502, "GITHUB_UNAVAILABLE", `GitHub returned ${res.status}.`);
}

/* ── OAuth ─────────────────────────────────────────────────────────── */

export function scopesFor(includePrivate: boolean): string {
  // `public_repo`/`repo` include write access, required later to push commits and open PRs.
  return includePrivate ? "read:user repo" : "read:user public_repo";
}

export async function exchangeCode(
  opts: { clientId: string; clientSecret: string; webUrl: string; code: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ token: string; scopes: string[] }> {
  let res: Response;
  try {
    res = await fetchImpl(`${opts.webUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "mobile-development-ai" },
      body: JSON.stringify({ client_id: opts.clientId, client_secret: opts.clientSecret, code: opts.code, redirect_uri: opts.redirectUri }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new HttpError(502, "GITHUB_UNAVAILABLE", "Couldn't reach GitHub to finish sign-in.");
  }
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; scope?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new HttpError(400, "OAUTH_EXCHANGE_FAILED", body.error ? `GitHub: ${body.error}` : "GitHub didn't return an access token.");
  }
  return {
    token: body.access_token,
    scopes: (body.scope ?? "").split(/[,\s]+/).filter(Boolean),
  };
}

/** Best-effort token revocation on logout (OAuth app credentials, basic auth). */
export async function revokeToken(
  opts: { clientId: string; clientSecret: string; apiUrl: string; token: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    await fetchImpl(`${opts.apiUrl}/applications/${encodeURIComponent(opts.clientId)}/token`, {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        "User-Agent": "mobile-development-ai",
      },
      body: JSON.stringify({ access_token: opts.token }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    /* the cookie is cleared regardless */
  }
}

/* ── Mappers (GitHub JSON → our wire types) ───────────────────────── */

export interface GhUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

export function mapUser(u: GhUser): SessionUser {
  return { id: u.id, login: u.login, name: u.name, avatarUrl: u.avatar_url };
}

export interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  default_branch: string;
  language: string | null;
  pushed_at: string | null;
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
}

export function mapRepo(r: GhRepo): RepoSummary {
  return {
    id: r.id,
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    private: r.private,
    fork: r.fork,
    archived: r.archived,
    defaultBranch: r.default_branch,
    language: r.language,
    pushedAt: r.pushed_at,
    permissions: { admin: !!r.permissions?.admin, push: !!r.permissions?.push, pull: r.permissions?.pull ?? true },
  };
}

export interface GhBranch {
  name: string;
  commit: { sha: string };
  protected?: boolean;
}

export function mapBranch(b: GhBranch): BranchSummary {
  return { name: b.name, sha: b.commit.sha, protected: !!b.protected };
}

export interface GhTree {
  sha: string;
  truncated: boolean;
  tree: { path: string; type: "blob" | "tree" | "commit"; size?: number }[];
}

export const MAX_TREE_ENTRIES = 10_000;

export function mapTree(t: GhTree): { entries: TreeEntry[]; truncated: boolean } {
  const all = t.tree.filter((e): e is { path: string; type: "blob" | "tree"; size?: number } => e.type === "blob" || e.type === "tree");
  const entries = all.slice(0, MAX_TREE_ENTRIES).map((e) => (e.type === "blob" ? { path: e.path, type: e.type, size: e.size ?? 0 } : { path: e.path, type: e.type }));
  return { entries, truncated: t.truncated || all.length > MAX_TREE_ENTRIES };
}

/** True for content we refuse to show as text. */
export function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return false;
  } catch {
    return true;
  }
}

/** Parse the `Link` header for a rel="next" page. */
export function hasNextPage(headers: Headers): boolean {
  return /rel="next"/.test(headers.get("link") ?? "");
}
