import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import commit from "../functions/github-commit";
import commits from "../functions/github-commits";
import branch from "../functions/github-branch";
import pulls from "../functions/github-pulls";
import { sessionCookie } from "../lib/session";
import { ORIGIN, SECRET_TOKEN, configureEnv, cookieHeader, gh, mockGitHub } from "./helpers";

let cookie = "";
beforeAll(async () => {
  configureEnv();
  const set = await sessionCookie(new Request(ORIGIN), {
    user: { id: 7, login: "octo", name: null, avatarUrl: "" },
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

const params = { owner: "octo", repo: "hello" };
const R = "/repos/octo/hello";
const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const NEW = "c".repeat(40);
const post = (path: string, body: unknown, headers: Record<string, string> = { origin: ORIGIN }) =>
  new Request(`${ORIGIN}${path}`, { method: "POST", headers: { cookie, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const err = async (res: Response) => ((await res.json()) as { error: { code: string; message: string } }).error;
const repoMeta = (push = true) => gh({ default_branch: "main", archived: false, permissions: { push } });

/** Happy-path Git Data API routes; tests override individual ones. */
function gitRoutes(over: Record<string, (url: URL, init?: RequestInit) => Response> = {}) {
  return mockGitHub({
    [`GET ${R}`]: () => repoMeta(),
    [`GET ${R}/git/ref/heads/feature/x`]: () => gh({ object: { sha: BASE } }),
    [`POST ${R}/git/refs`]: () => gh({ ref: "refs/heads/ai/x", object: { sha: BASE } }, { status: 201 }),
    [`GET ${R}/git/commits/${BASE}`]: () => gh({ sha: BASE, tree: { sha: "t0" } }),
    [`GET ${R}/git/trees/t0`]: () => gh({ sha: "t0", truncated: false, tree: [{ path: "run.sh", mode: "100755", type: "blob" }, { path: "old.txt", mode: "100644", type: "blob" }] }),
    [`POST ${R}/git/trees`]: () => gh({ sha: "t1" }, { status: 201 }),
    [`POST ${R}/git/commits`]: () => gh({ sha: NEW, html_url: `https://github.com/octo/hello/commit/${NEW}`, tree: { sha: "t1" } }, { status: 201 }),
    [`PATCH ${R}/git/refs/heads/ai/x`]: () => gh({ object: { sha: NEW } }),
    [`PATCH ${R}/git/refs/heads/feature/x`]: () => gh({ object: { sha: NEW } }),
    [`DELETE ${R}/git/refs/heads/ai/x`]: () => new Response(null, { status: 204 }),
    ...over,
  });
}

const files = [
  { path: "src/App.jsx", content: "export default 1;\n" },
  { path: "run.sh", content: "echo hi\n" },
  { path: "old.txt", content: null },
  { path: "never-existed.txt", content: null },
];

describe("POST commit", () => {
  it("creates the working branch, builds one commit (keeping file modes) and fast-forwards the ref", async () => {
    const calls = gitRoutes();
    const res = await commit(post("/x", { branch: "ai/x", createFrom: BASE, baseSha: BASE, message: "Add things", files }), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { created: boolean; commit: { sha: string }; files: number };
    expect(body).toMatchObject({ created: true, commit: { sha: NEW }, files: 3 });

    const tree = JSON.parse(String(calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/git/trees"))!.init!.body)) as { base_tree: string; tree: { path: string; mode: string; sha?: null; content?: string }[] };
    expect(tree.base_tree).toBe("t0");
    expect(tree.tree).toEqual([
      { path: "src/App.jsx", mode: "100644", type: "blob", content: "export default 1;\n" },
      { path: "run.sh", mode: "100755", type: "blob", content: "echo hi\n" },
      { path: "old.txt", mode: "100644", type: "blob", sha: null },
    ]);
    const c = JSON.parse(String(calls.find((x) => x.method === "POST" && x.url.pathname.endsWith("/git/commits"))!.init!.body)) as { parents: string[]; message: string };
    expect(c).toMatchObject({ parents: [BASE], message: "Add things" });
    const patch = JSON.parse(String(calls.find((x) => x.method === "PATCH")!.init!.body)) as { force: boolean };
    expect(patch.force).toBe(false);
    // The token goes to GitHub only, never into our response.
    expect(JSON.stringify(body)).not.toContain(SECRET_TOKEN);
  });

  it("requires explicit confirmation for the default branch", async () => {
    gitRoutes();
    const res = await commit(post("/x", { branch: "main", baseSha: BASE, message: "m", files }), { params });
    expect(res.status).toBe(409);
    expect((await err(res)).code).toBe("BRANCH_PROTECTED");
  });

  it("refuses when upstream changed a file we edited, and allows unrelated upstream changes", async () => {
    gitRoutes({
      [`GET ${R}/git/ref/heads/feature/x`]: () => gh({ object: { sha: HEAD } }),
      [`GET ${R}/compare/${BASE}...${HEAD}`]: () => gh({ files: [{ filename: "src/App.jsx" }] }),
    });
    const res = await commit(post("/x", { branch: "feature/x", baseSha: BASE, message: "m", files }), { params });
    expect(res.status).toBe(409);
    expect(await err(res)).toMatchObject({ code: "GIT_CONFLICT", message: expect.stringContaining("src/App.jsx") });

    const calls = gitRoutes({
      [`GET ${R}/git/ref/heads/feature/x`]: () => gh({ object: { sha: HEAD } }),
      [`GET ${R}/compare/${BASE}...${HEAD}`]: () => gh({ files: [{ filename: "docs/other.md" }] }),
      [`GET ${R}/git/commits/${HEAD}`]: () => gh({ sha: HEAD, tree: { sha: "t0" } }),
    });
    const ok = await commit(post("/x", { branch: "feature/x", baseSha: BASE, message: "m", files }), { params });
    expect(ok.status).toBe(200);
    const c = JSON.parse(String(calls.find((x) => x.method === "POST" && x.url.pathname.endsWith("/git/commits"))!.init!.body)) as { parents: string[] };
    expect(c.parents).toEqual([HEAD]); // on top of the new head, not a force-push
  });

  it("maps a non-fast-forward to GIT_CONFLICT and deletes a branch it created when the commit fails", async () => {
    const calls = gitRoutes({ [`PATCH ${R}/git/refs/heads/ai/x`]: () => gh({ message: "Update is not a fast forward" }, { status: 422 }) });
    const res = await commit(post("/x", { branch: "ai/x", createFrom: BASE, baseSha: BASE, message: "m", files }), { params });
    expect((await err(res)).code).toBe("GIT_CONFLICT");
    expect(calls.some((c) => c.method === "DELETE" && c.url.pathname === `${R}/git/refs/heads/ai/x`)).toBe(true);
  });

  it("reports an existing branch, missing push access, CSRF and invalid input", async () => {
    gitRoutes({ [`POST ${R}/git/refs`]: () => gh({ message: "Reference already exists" }, { status: 422 }) });
    expect((await err(await commit(post("/x", { branch: "ai/x", createFrom: BASE, baseSha: BASE, message: "m", files }), { params }))).code).toBe("BRANCH_EXISTS");

    gitRoutes({ [`GET ${R}`]: () => repoMeta(false) });
    expect((await err(await commit(post("/x", { branch: "ai/x", createFrom: BASE, baseSha: BASE, message: "m", files }), { params }))).code).toBe("FORBIDDEN");

    const calls = gitRoutes();
    const csrf = await commit(post("/x", { branch: "ai/x", baseSha: BASE, message: "m", files }, { origin: "https://evil.example" }), { params });
    expect(csrf.status).toBe(403);
    expect(calls).toHaveLength(0);

    for (const bad of [
      { branch: "ai/x", baseSha: BASE, message: "m", files: [{ path: "../etc/passwd", content: "x" }] },
      { branch: "ai/x", baseSha: BASE, message: "m", files: [{ path: ".git/config", content: "x" }] },
      { branch: "bad..name", baseSha: BASE, message: "m", files },
      { branch: "ai/x", baseSha: BASE, message: "  ", files },
      { branch: "ai/x", baseSha: BASE, message: "m", files: [] },
      { branch: "ai/x", baseSha: "nope", message: "m", files },
    ]) {
      const r = await commit(post("/x", bad), { params });
      expect(r.status, JSON.stringify(bad)).toBe(422);
    }
  });
});

describe("branch, commits, pulls", () => {
  it("creates a branch and never overwrites one", async () => {
    mockGitHub({ [`POST ${R}/git/refs`]: () => gh({}, { status: 201 }) });
    expect((await branch(post("/x", { name: "ai/new", from: BASE }), { params })).status).toBe(201);
    mockGitHub({ [`POST ${R}/git/refs`]: () => gh({ message: "Reference already exists" }, { status: 422 }) });
    expect((await err(await branch(post("/x", { name: "ai/new", from: BASE }), { params }))).code).toBe("BRANCH_EXISTS");
  });

  it("lists recent commits for a branch", async () => {
    const calls = mockGitHub({
      [`GET ${R}/commits`]: () => gh([{ sha: NEW, html_url: "https://github.com/c", commit: { message: "Subject\n\nBody", author: { name: "Octo", date: "2026-10-01T00:00:00Z" } }, author: { login: "octo" } }]),
    });
    const res = await commits(new Request(`${ORIGIN}/x?ref=feature/x`, { headers: { cookie } }), { params });
    expect(await res.json()).toEqual({ commits: [{ sha: NEW, message: "Subject", author: "octo", date: "2026-10-01T00:00:00Z", url: "https://github.com/c" }] });
    expect(calls[0]!.url.searchParams.get("sha")).toBe("feature/x");
  });

  it("opens a PR, or returns the one that's already open", async () => {
    const pr = { number: 5, html_url: "https://github.com/octo/hello/pull/5", title: "T", state: "open", draft: false, merged_at: null, head: { ref: "ai/x" }, base: { ref: "main" } };
    mockGitHub({ [`POST ${R}/pulls`]: () => gh(pr, { status: 201 }) });
    const res = await pulls(post("/x", { head: "ai/x", base: "main", title: "T", body: "B" }), { params });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ existing: false, pull: { number: 5, head: "ai/x", base: "main" } });

    mockGitHub({
      [`POST ${R}/pulls`]: () => gh({ message: "Validation Failed: A pull request already exists for octo:ai/x." }, { status: 422 }),
      [`GET ${R}/pulls`]: () => gh([pr]),
    });
    expect(await (await pulls(post("/x", { head: "ai/x", base: "main", title: "T", body: "B" }), { params })).json()).toMatchObject({ existing: true, pull: { number: 5 } });

    expect((await pulls(post("/x", { head: "main", base: "main", title: "T", body: "" }), { params })).status).toBe(422);
  });
});
