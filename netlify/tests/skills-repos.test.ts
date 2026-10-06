import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import skills from "../functions/skills";
import repos from "../functions/github-repos";
import { sessionCookie } from "../lib/session";
import { ORIGIN, SECRET_TOKEN, configureEnv, cookieHeader, gh, mockGitHub } from "./helpers";

let cookie = "";
let privCookie = "";

async function makeCookie(includePrivate: boolean) {
  const set = await sessionCookie(new Request(ORIGIN), { user: { id: 9, login: "octo", name: null, avatarUrl: "" }, token: SECRET_TOKEN, scopes: ["public_repo"], includePrivate });
  return cookieHeader(new Response(null, { headers: [["set-cookie", set]] }));
}

beforeAll(async () => {
  configureEnv();
  cookie = await makeCookie(false);
  privCookie = await makeCookie(true);
});
beforeEach(() => configureEnv());
afterEach(() => vi.unstubAllGlobals());

const call = (fn: typeof skills, path: string, method: string, body?: unknown, c = cookie) =>
  fn(new Request(`${ORIGIN}${path}`, { method, headers: { cookie: c, origin: ORIGIN, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));

describe("/api/skills (session storage)", () => {
  it("requires sign-in", async () => {
    expect((await call(skills, "/api/skills", "GET", undefined, "")).status).toBe(401);
  });

  it("returns defaults, saves custom skills in a sealed cookie and reads them back", async () => {
    const first = await (await call(skills, "/api/skills", "GET")).json();
    expect(first).toMatchObject({ custom: [], storage: "session" });
    expect(first.enabled).toContain("code-review");

    const skill = { id: "u_abc123def", name: "  Team  style ", description: "", instructions: "Use tabs.", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
    const res = await call(skills, "/api/skills", "PUT", { custom: [skill], enabled: ["u_abc123def", "nope", "debugging"] });
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.custom[0].name).toBe("Team  style"); // trimmed only
    expect(saved.enabled).toEqual(expect.arrayContaining(["u_abc123def", "debugging"]));
    expect(saved.enabled).not.toContain("nope");
    const jar = cookieHeader(res, cookie);
    expect(jar).not.toContain("Use tabs"); // sealed, not plaintext

    const again = await (await call(skills, "/api/skills", "GET", undefined, jar)).json();
    expect(again.custom.map((s: { id: string }) => s.id)).toEqual(["u_abc123def"]);
  });

  it("rejects cross-site writes and invalid ids", async () => {
    const bad = await skills(new Request(`${ORIGIN}/api/skills`, { method: "PUT", headers: { cookie, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }));
    expect(bad.status).toBe(403);
    const res = await call(skills, "/api/skills", "PUT", { custom: [{ id: "../x", name: "a", description: "", instructions: "b", createdAt: "", updatedAt: "" }], enabled: [] });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/github/repos", () => {
  it("creates a repository on the user's account", async () => {
    const calls = mockGitHub({
      "GET /repos/octo/fresh": () => gh({ message: "Not Found" }, { status: 404 }),
      "POST /user/repos": (_u, init) => {
        const b = JSON.parse(String(init!.body));
        return gh({ id: 5, name: b.name, full_name: `octo/${b.name}`, owner: { login: "octo" }, description: null, private: b.private, fork: false, archived: false, default_branch: "main", language: null, pushed_at: null, permissions: { admin: true, push: true, pull: true } }, { status: 201 });
      },
    });
    const res = await call(repos, "/api/github/repos", "POST", { name: "fresh", private: false });
    expect(res.status).toBe(201);
    expect((await res.json()).repo).toMatchObject({ owner: "octo", name: "fresh" });
    const post = calls.find((c) => c.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toMatchObject({ name: "fresh", private: false, auto_init: true });
    expect(new Headers(post.init!.headers).get("authorization")).toContain(SECRET_TOKEN);
  });

  it("answers 409 REPO_EXISTS for a duplicate name", async () => {
    mockGitHub({ "GET /repos/octo/taken": () => gh({ id: 1 }) });
    const res = await call(repos, "/api/github/repos", "POST", { name: "taken", private: false });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("REPO_EXISTS");
  });

  it("refuses private repos without private access, and invalid names", async () => {
    mockGitHub({});
    expect((await call(repos, "/api/github/repos", "POST", { name: "secret", private: true })).status).toBe(403);
    expect((await call(repos, "/api/github/repos", "POST", { name: "bad name", private: false }, privCookie)).status).toBe(422);
  });
});
