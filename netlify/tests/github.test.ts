import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import repos from "../functions/github-repos";
import repoFn from "../functions/github-repo";
import branches from "../functions/github-branches";
import tree from "../functions/github-tree";
import file from "../functions/github-file";
import { sessionCookie } from "../lib/session";
import { ORIGIN, SECRET_TOKEN, configureEnv, cookieHeader, gh, mockGitHub } from "./helpers";

let cookie = "";

beforeAll(async () => {
  configureEnv();
  const set = await sessionCookie(new Request(ORIGIN), {
    user: { id: 1, login: "octo", name: null, avatarUrl: "" },
    token: SECRET_TOKEN,
    scopes: ["public_repo"],
    includePrivate: false,
  });
  cookie = cookieHeader(new Response(null, { headers: [["set-cookie", set]] }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  configureEnv();
});

const req = (path: string) => new Request(`${ORIGIN}${path}`, { headers: { cookie } });
const params = { owner: "octo", repo: "hello" };

const ghRepo = {
  id: 1,
  name: "hello",
  full_name: "octo/hello",
  owner: { login: "octo" },
  description: "Hi",
  private: false,
  fork: false,
  archived: false,
  default_branch: "main",
  language: "TypeScript",
  pushed_at: "2026-10-01T00:00:00Z",
  permissions: { admin: false, push: true, pull: true },
};

describe("auth guard", () => {
  it("returns 401 UNAUTHENTICATED without a session", async () => {
    const res = await repos(new Request(`${ORIGIN}/api/github/repos`));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("UNAUTHENTICATED");
  });

  it("maps a revoked GitHub token to SESSION_EXPIRED and clears the cookie", async () => {
    mockGitHub({ "GET /user/repos": () => gh({ message: "Bad credentials" }, { status: 401 }) });
    const res = await repos(req("/api/github/repos"));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("SESSION_EXPIRED");
    expect(res.headers.getSetCookie().join()).toMatch(/mdai_session=; .*Max-Age=0/);
  });
});

describe("GET /api/github/repos", () => {
  it("lists repos with pagination and sends the token only to GitHub", async () => {
    const calls = mockGitHub({
      "GET /user/repos": () => gh([ghRepo], { headers: { "content-type": "application/json", link: '<https://api.github.com/user/repos?page=2>; rel="next"' } }),
    });
    const res = await repos(req("/api/github/repos?page=1"));
    const text = await res.text();
    expect(text).not.toContain(SECRET_TOKEN);
    expect(JSON.parse(text)).toMatchObject({ page: 1, hasNext: true, repos: [{ fullName: "octo/hello", defaultBranch: "main", private: false, permissions: { push: true } }] });
    expect(calls[0]!.url.origin).toBe("https://api.github.com");
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET_TOKEN}`);
    expect(calls[0]!.url.searchParams.get("sort")).toBe("pushed");
  });

  it("maps GitHub rate limits", async () => {
    mockGitHub({
      "GET /user/repos": () =>
        gh({ message: "API rate limit exceeded" }, { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 300) } }),
    });
    const res = await repos(req("/api/github/repos"));
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toMatch(/5 min/);
  });

  it("rejects an invalid page", async () => {
    mockGitHub({});
    expect((await repos(req("/api/github/repos?page=-3"))).status).toBe(422);
  });
});

describe("repo, branches, tree, file", () => {
  it("validates owner/repo params", async () => {
    const res = await repoFn(req("/api/github/repos/x/y"), { params: { owner: "../etc", repo: "y" } });
    expect(res.status).toBe(422);
  });

  it("returns repo metadata; 404 explains private access", async () => {
    mockGitHub({ "GET /repos/octo/hello": () => gh(ghRepo) });
    expect(((await (await repoFn(req("/x"), { params })).json()) as { repo: { name: string } }).repo.name).toBe("hello");
    mockGitHub({});
    const res = await repoFn(req("/x"), { params: { owner: "octo", repo: "secret" } });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/private/);
  });

  it("lists branches", async () => {
    mockGitHub({ "GET /repos/octo/hello/branches": () => gh([{ name: "main", commit: { sha: "a" }, protected: true }, { name: "feature/x", commit: { sha: "b" } }]) });
    const body = (await (await branches(req("/x"), { params })).json()) as { branches: { name: string; protected: boolean }[]; truncated: boolean };
    expect(body.branches).toEqual([
      { name: "main", sha: "a", protected: true },
      { name: "feature/x", sha: "b", protected: false },
    ]);
    expect(body.truncated).toBe(false);
  });

  it("resolves a slashed branch to its tree", async () => {
    const calls = mockGitHub({
      "GET /repos/octo/hello/branches/feature%2Fx": () => gh({ name: "feature/x", commit: { sha: "c1", commit: { tree: { sha: "t1" } } } }),
      "GET /repos/octo/hello/git/trees/t1": () =>
        gh({ sha: "t1", truncated: false, tree: [{ path: "src", type: "tree" }, { path: "src/a.ts", type: "blob", size: 10 }, { path: "vendor/lib", type: "commit" }] }),
    });
    const res = await tree(req("/x?ref=feature%2Fx"), { params });
    expect(await res.json()).toEqual({
      ref: "feature/x",
      commitSha: "c1",
      truncated: false,
      entries: [{ path: "src", type: "tree" }, { path: "src/a.ts", type: "blob", size: 10 }],
    });
    expect(calls[1]!.url.searchParams.get("recursive")).toBe("1");
  });

  it("rejects malicious refs", async () => {
    mockGitHub({});
    expect((await tree(req("/x?ref=..%2F..%2Fsecrets"), { params })).status).toBe(422);
    expect((await tree(req("/x"), { params })).status).toBe(422);
  });

  it("reports empty repositories", async () => {
    mockGitHub({ "GET /repos/octo/hello/branches/main": () => gh({ message: "Git Repository is empty." }, { status: 409 }) });
    const res = await tree(req("/x?ref=main"), { params });
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("EMPTY_REPOSITORY");
  });

  it("returns text files and refuses binary, oversized, and traversal paths", async () => {
    const content = (s: string | Uint8Array) => Buffer.from(s).toString("base64");
    mockGitHub({
      "GET /repos/octo/hello/contents/src/a.ts": () => gh({ type: "file", path: "src/a.ts", sha: "s", size: 12, encoding: "base64", content: content("export {};\n") }),
      "GET /repos/octo/hello/contents/logo.png": () => gh({ type: "file", path: "logo.png", sha: "s", size: 4, encoding: "base64", content: content(new Uint8Array([137, 80, 0, 71])) }),
      "GET /repos/octo/hello/contents/big.json": () => gh({ type: "file", path: "big.json", sha: "s", size: 5_000_000, encoding: "none", content: "" }),
    });
    const ok = (await (await file(req("/x?ref=main&path=src%2Fa.ts"), { params })).json()) as { content: string };
    expect(ok.content).toBe("export {};\n");
    expect((await file(req("/x?ref=main&path=logo.png"), { params })).status).toBe(415);
    expect((await file(req("/x?ref=main&path=big.json"), { params })).status).toBe(413);
    expect((await file(req("/x?ref=main&path=..%2F..%2Fetc%2Fpasswd"), { params })).status).toBe(422);
    expect((await file(req("/x?ref=main&path=%2Fabs"), { params })).status).toBe(422);
  });
});
