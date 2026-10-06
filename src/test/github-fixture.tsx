import { render } from "@testing-library/react";
import { vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppRoutes } from "@/App";
import { SessionProvider } from "@/stores/session";
import { ThemeProvider } from "@/stores/theme";
import { CommandPalette } from "@/features/command/command-palette";
import type { Session } from "@/types/session";
import type { RepoSummary } from "@/types/github";
import type { ProvidersResponse } from "@/types/ai";
import type { WorkspaceFile } from "@/types/workspace";
import { SAMPLE_FILES, SAMPLE_PROJECT } from "./sample-project";

/** A signed-in GitHub session + a mocked /api/* serving the sample repo, for flow tests. */

export const GH_SESSION: Session = {
  mode: "github",
  user: { id: 1, login: "octo", name: "Octo Cat", avatarUrl: "https://avatars.example/1" },
  scopes: ["read:user", "public_repo"],
  includePrivate: false,
  expiresAt: "2099-01-01T00:00:00Z",
};

export const SAMPLE_REPO: RepoSummary = {
  id: 42,
  owner: SAMPLE_PROJECT.owner,
  name: SAMPLE_PROJECT.name,
  fullName: `${SAMPLE_PROJECT.owner}/${SAMPLE_PROJECT.name}`,
  description: SAMPLE_PROJECT.description ?? null,
  private: false,
  fork: false,
  archived: false,
  defaultBranch: "main",
  language: "JavaScript",
  pushedAt: new Date().toISOString(),
  permissions: { admin: true, push: true, pull: true },
};

export const SAMPLE_PATH = `/app/projects/${SAMPLE_PROJECT.owner}/${SAMPLE_PROJECT.name}`;
export const COMMIT_SHA = "c0ffee".padEnd(40, "0");

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export type Extra = (url: URL, init: RequestInit | undefined) => Response | undefined | Promise<Response | undefined>;

export interface MockOptions {
  files?: WorkspaceFile[];
  repo?: Partial<RepoSummary>;
  /** Checked first; return undefined to fall through to the defaults. */
  extra?: Extra;
  /** Providers response for /api/ai/providers (default: one ready default provider). */
  providers?: unknown;
}

export const READY_PROVIDERS: ProvidersResponse = {
  storage: "database",
  storageNote: "",
  maxProviders: 20,
  defaultId: "p1",
  providers: [
    { id: "p1", kind: "openai", label: "OpenAI", model: "gpt-test", effort: "medium", baseUrl: null, enabled: true, isDefault: true, keyHint: "sk-…test", source: "user", lastTest: null, updatedAt: "2026-01-01T00:00:00Z" },
  ],
};

export function mockGitHub(opts: MockOptions = {}) {
  const files = opts.files ?? SAMPLE_FILES;
  const repo = { ...SAMPLE_REPO, ...opts.repo };
  const base = `/api/github/repos/${repo.owner}/${repo.name}`;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, "http://localhost");
    const extra = await opts.extra?.(url, init);
    if (extra) return extra;
    const p = url.pathname;
    if (p === "/api/auth/session") return json({ authenticated: false });
    if (p === "/api/github/repos") return json({ repos: [repo], page: 1, hasNext: false });
    if (p === base) return json({ repo });
    if (p === `${base}/branches`) return json({ branches: [{ name: "main", sha: COMMIT_SHA, protected: false }], truncated: false });
    if (p === `${base}/tree`) {
      return json({ ref: url.searchParams.get("ref") ?? "main", commitSha: COMMIT_SHA, truncated: false, entries: files.map((f) => ({ path: f.path, type: "blob", size: f.content.length })) });
    }
    if (p === `${base}/file`) {
      const path = url.searchParams.get("path") ?? "";
      const f = files.find((x) => x.path === path);
      return f ? json({ path, ref: COMMIT_SHA, sha: `blob-${path}`, size: f.content.length, content: f.content }) : json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    }
    if (p === `${base}/commits`) return json({ commits: [] });
    if (p === `${base}/pulls`) return json({ pulls: [] });
    if (p === "/api/ai/providers") return json(opts.providers ?? READY_PROVIDERS);
    if (p === "/api/skills") return json({ custom: [], enabled: ["code-review"], storage: "database" });
    return json({ error: { code: "NOT_FOUND", message: `no mock for ${p}` } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function renderApp(path: string, session: Session = GH_SESSION) {
  const loc = memoryLocation({ path, record: true });
  const utils = render(
    <ThemeProvider>
      <SessionProvider initial={session}>
        <Router hook={loc.hook}>
          <AppRoutes />
          <CommandPalette />
        </Router>
      </SessionProvider>
    </ThemeProvider>,
  );
  return { loc, ...utils };
}
