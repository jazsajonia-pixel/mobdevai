import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppRoutes } from "./App";
import { SessionProvider } from "./stores/session";
import { ThemeProvider } from "./stores/theme";
import type { Session } from "./types/session";

const githubSession: Session = {
  mode: "github",
  user: { id: 1, login: "octo", name: "Octo Cat", avatarUrl: "https://avatars.example/1" },
  scopes: ["read:user", "public_repo"],
  includePrivate: false,
  expiresAt: "2026-10-11T00:00:00Z",
};

const repo = {
  id: 1,
  owner: "octo",
  name: "hello",
  fullName: "octo/hello",
  description: "Hello repo",
  private: false,
  fork: false,
  archived: false,
  defaultBranch: "main",
  language: "TypeScript",
  pushedAt: new Date().toISOString(),
  permissions: { admin: false, push: false, pull: true },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockApi(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), "http://localhost");
    const key = url.pathname + (url.search ? url.search : "");
    const route = routes[key] ?? routes[url.pathname];
    return route ? route() : json({ error: { code: "NOT_FOUND", message: "nope" } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(path: string, session: Session = githubSession) {
  const loc = memoryLocation({ path, record: true });
  render(
    <ThemeProvider>
      <SessionProvider initial={session}>
        <Router hook={loc.hook}>
          <AppRoutes />
        </Router>
      </SessionProvider>
    </ThemeProvider>,
  );
  return loc;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("GitHub projects", () => {
  it("lists repositories and filters them", async () => {
    mockApi({ "/api/github/repos": () => json({ repos: [repo, { ...repo, id: 2, name: "other", fullName: "octo/other", description: null }], page: 1, hasNext: false }) });
    renderAt("/app/projects");
    expect(await screen.findByTestId("row-repo-octo/hello")).toBeInTheDocument();
    expect(screen.getAllByText("read-only").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByTestId("input-search-projects"), { target: { value: "oth" } });
    expect(screen.queryByTestId("row-repo-octo/hello")).not.toBeInTheDocument();
    expect(screen.getByTestId("row-repo-octo/other")).toBeInTheDocument();
  });

  it("shows a readable error and retries", async () => {
    let fail = true;
    mockApi({
      "/api/github/repos": () =>
        fail ? json({ error: { code: "RATE_LIMITED", message: "slow down" } }, 429) : json({ repos: [repo], page: 1, hasNext: false }),
    });
    renderAt("/app/projects");
    expect(await screen.findByText("Rate limit reached")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByText("Try again"));
    expect(await screen.findByTestId("row-repo-octo/hello")).toBeInTheDocument();
  });

  it("signs the user out when the server reports an expired session", async () => {
    mockApi({ "/api/github/repos": () => json({ error: { code: "SESSION_EXPIRED", message: "expired" } }, 401) });
    const loc = renderAt("/app/projects");
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/signin"));
    expect(await screen.findByText("Your session expired")).toBeInTheDocument();
  });
});

describe("GitHub workspace", () => {
  it("loads the tree, opens a file, and switches branch", async () => {
    const fetchMock = mockApi({
      "/api/github/repos/octo/hello": () => json({ repo }),
      "/api/github/repos/octo/hello/branches": () =>
        json({ branches: [{ name: "main", sha: "a", protected: true }, { name: "feature/x", sha: "b", protected: false }], truncated: false }),
      "/api/github/repos/octo/hello/tree?ref=main": () =>
        json({ ref: "main", commitSha: "c1", truncated: false, entries: [{ path: "README.md", type: "blob", size: 5 }, { path: "src", type: "tree" }, { path: "src/a.ts", type: "blob", size: 3 }] }),
      "/api/github/repos/octo/hello/tree?ref=feature%2Fx": () =>
        json({ ref: "feature/x", commitSha: "c2", truncated: true, entries: [{ path: "NEW.md", type: "blob", size: 5 }] }),
      "/api/github/repos/octo/hello/file?ref=c1&path=README.md": () => json({ path: "README.md", ref: "main", sha: "s", size: 7, content: "# Hello" }),
    });
    renderAt("/app/projects/octo/hello");

    fireEvent.click(await screen.findByText("README.md"));
    expect(await screen.findByTestId("code-editor")).toHaveTextContent("# Hello");

    fireEvent.click(screen.getByTestId("button-branch"));
    fireEvent.click(await screen.findByTestId("branch-feature/x"));
    expect(await screen.findByText("NEW.md")).toBeInTheDocument();
    expect(screen.getByText(/partial file list/)).toBeInTheDocument();
    expect(screen.getByTestId("text-branch")).toHaveTextContent("feature/x");
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("ref=feature%2Fx"))).toBe(true);
  });

  it("explains binary files", async () => {
    mockApi({
      "/api/github/repos/octo/hello": () => json({ repo }),
      "/api/github/repos/octo/hello/branches": () => json({ branches: [], truncated: false }),
      "/api/github/repos/octo/hello/tree?ref=main": () => json({ ref: "main", commitSha: "c1", truncated: false, entries: [{ path: "logo.png", type: "blob", size: 5 }] }),
      "/api/github/repos/octo/hello/file?ref=c1&path=logo.png": () => json({ error: { code: "BINARY_FILE", message: "binary" } }, 415),
    });
    renderAt("/app/projects/octo/hello");
    fireEvent.click(await screen.findByText("logo.png"));
    expect(await screen.findByText("Binary file")).toBeInTheDocument();
    expect(screen.getByText("View on GitHub")).toBeInTheDocument();
  });

  it("shows the read-only notice on the Git tab", async () => {
    mockApi({
      "/api/github/repos/octo/hello": () => json({ repo }),
      "/api/github/repos/octo/hello/branches": () => json({ branches: [], truncated: false }),
      "/api/github/repos/octo/hello/tree?ref=main": () => json({ ref: "main", commitSha: "c1", truncated: false, entries: [] }),
    });
    renderAt("/app/projects/octo/hello/git");
    expect(await screen.findByText("Read-only access.")).toBeInTheDocument();
  });

  it("sends signed-out visitors to sign in", () => {
    const loc = renderAt("/app/projects/octo/hello", { mode: "anonymous" });
    expect(loc.history?.at(-1)).toBe("/signin");
  });
});
