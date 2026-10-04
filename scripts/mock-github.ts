/**
 * Mock GitHub (OAuth + the REST endpoints we use) for local end-to-end testing without real
 * credentials. Start with `npm run dev:mock-github`, then set in .env:
 *   GITHUB_API_URL=http://127.0.0.1:8790/api   GITHUB_WEB_URL=http://127.0.0.1:8790
 *   VITE_GITHUB_WEB_URL=http://127.0.0.1:8790  GITHUB_CLIENT_ID=mock-id  GITHUB_CLIENT_SECRET=mock-secret
 * Never point production at this.
 */
import { createServer } from "node:http";

const port = Number(process.env.MOCK_GITHUB_PORT ?? 8790);
const TOKEN = "gho_mocktoken_for_local_testing_only";

const files: Record<string, string> = {
  "README.md": "# hello-mobile\n\nA mock repository served by scripts/mock-github.ts.\n",
  "index.html": '<!doctype html>\n<html>\n  <body>\n    <h1>Hello from the mock repo</h1>\n    <script src="app.js"></script>\n  </body>\n</html>\n',
  "app.js": 'document.querySelector("h1").addEventListener("click", () => alert("hi"));\n',
  "src/styles/main.css": "body { font-family: system-ui; }\n",
  "assets/logo.png": "\u0000PNG",
};

const repos = [
  { id: 1, name: "hello-mobile", private: false, description: "Static site used for mock testing", language: "HTML" },
  { id: 2, name: "secret-api", private: true, description: "Private repository", language: "TypeScript" },
  { id: 3, name: "empty-repo", private: false, description: null, language: null },
].map((r) => ({
  ...r,
  full_name: `octo-dev/${r.name}`,
  owner: { login: "octo-dev" },
  fork: false,
  archived: false,
  default_branch: "main",
  pushed_at: new Date(Date.now() - r.id * 3600_000).toISOString(),
  permissions: { admin: true, push: true, pull: true },
}));

/* Tiny in-memory git store so commits/branches/PRs can be exercised end to end. */
interface MockCommit { sha: string; parent: string | null; tree: Record<string, string>; message: string; date: string }
const commits = new Map<string, MockCommit>();
const treeObjs = new Map<string, Record<string, string>>();
let seq = 0;
const mkSha = (p: string) => (p + (++seq).toString(16)).padEnd(40, "0").slice(0, 40);
const root: MockCommit = { sha: "c0ffee".padEnd(40, "0"), parent: null, tree: { ...files }, message: "Initial commit", date: new Date(Date.now() - 86400_000).toISOString() };
commits.set(root.sha, root);
treeObjs.set("t" + root.sha, root.tree);
const refs = new Map<string, string>([["main", root.sha], ["feature/mobile-nav", root.sha], ["dev", root.sha]]);
const PROTECTED = new Set(["main"]);
const pulls: { number: number; head: string; base: string; title: string; state: "open"; draft: boolean }[] = [];
const treeShaOf = (c: MockCommit) => {
  const id = "t" + c.sha;
  treeObjs.set(id, c.tree);
  return id;
};
const branchList = () => [...refs].map(([name, sha]) => ({ name, commit: { sha }, protected: PROTECTED.has(name) }));
async function readBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function send(res: import("node:http").ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const p = url.pathname;
  const authed = req.headers.authorization === `Bearer ${TOKEN}`;

  if (p === "/login/oauth/authorize") {
    const back = new URL(url.searchParams.get("redirect_uri")!);
    back.searchParams.set("code", "mock-code");
    back.searchParams.set("state", url.searchParams.get("state") ?? "");
    res.writeHead(302, { location: back.toString() }).end();
    return;
  }
  if (p === "/login/oauth/access_token" && req.method === "POST") return send(res, 200, { access_token: TOKEN, scope: "read:user,public_repo", token_type: "bearer" });
  if (p.startsWith("/api/applications/")) return send(res, 204, {});
  if (!p.startsWith("/api/")) return send(res, 404, { message: "Not Found" });
  if (!authed) return send(res, 401, { message: "Bad credentials" });

  const api = p.slice(4);
  if (api === "/user") return send(res, 200, { id: 4242, login: "octo-dev", name: "Octo Developer", avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4" });
  if (api === "/user/repos") return send(res, 200, repos);

  const m = /^\/repos\/octo-dev\/([^/]+)(.*)$/.exec(api);
  const repo = m && repos.find((r) => r.name === m[1]);
  if (!m || !repo) return send(res, 404, { message: "Not Found" });
  const rest = m[2] ?? "";
  if (repo.name === "empty-repo" && rest) return send(res, 409, { message: "Git Repository is empty." });
  if (rest === "") return send(res, 200, repo);
  const method = req.method ?? "GET";
  if (rest === "/branches") return send(res, 200, branchList());
  const b = /^\/branches\/(.+)$/.exec(rest);
  if (b) {
    const name = decodeURIComponent(b[1]!);
    const sha = refs.get(name);
    return sha ? send(res, 200, { name, commit: { sha, commit: { tree: { sha: treeShaOf(commits.get(sha)!) } } }, protected: PROTECTED.has(name) }) : send(res, 404, { message: "Branch not found" });
  }
  const gt = /^\/git\/trees\/(.+)$/.exec(rest);
  if (gt && method === "GET") {
    const t = treeObjs.get(decodeURIComponent(gt[1]!)) ?? files;
    const dirs = new Set<string>();
    for (const f of Object.keys(t)) f.split("/").slice(0, -1).forEach((_, i, a) => dirs.add(a.slice(0, i + 1).join("/")));
    const tree = [...[...dirs].map((d) => ({ path: d, type: "tree", mode: "040000" })), ...Object.entries(t).map(([path, c]) => ({ path, type: "blob", mode: "100644", size: c.length }))];
    return send(res, 200, { sha: gt[1], truncated: false, tree });
  }
  const c = /^\/contents\/(.+)$/.exec(rest);
  if (c) {
    const path = decodeURIComponent(c[1]!);
    const ref = url.searchParams.get("ref") ?? "main";
    const commit = commits.get(ref) ?? commits.get(refs.get(ref) ?? "");
    const content = commit?.tree[path];
    if (content === undefined) return send(res, 404, { message: "Not Found" });
    return send(res, 200, { type: "file", path, sha: "blob-" + path, size: content.length, encoding: "base64", content: Buffer.from(content).toString("base64") });
  }
  // ── Git Data API (writes) ──
  const ref = /^\/git\/refs?\/heads\/(.+)$/.exec(rest);
  if (ref) {
    const name = ref[1]!.split("/").map(decodeURIComponent).join("/");
    if (method === "GET") return refs.has(name) ? send(res, 200, { ref: `refs/heads/${name}`, object: { sha: refs.get(name) } }) : send(res, 404, { message: "Not Found" });
    if (method === "DELETE") return refs.delete(name), send(res, 204, {});
    if (method === "PATCH") {
      const body = await readBody(req);
      const next = commits.get(String(body.sha));
      if (!next) return send(res, 422, { message: "Object does not exist" });
      if (next.parent !== refs.get(name) && !body.force) return send(res, 422, { message: "Update is not a fast forward" });
      refs.set(name, next.sha);
      return send(res, 200, { ref: `refs/heads/${name}`, object: { sha: next.sha } });
    }
  }
  if (rest === "/git/refs" && method === "POST") {
    const body = await readBody(req);
    const name = String(body.ref).replace(/^refs\/heads\//, "");
    if (refs.has(name)) return send(res, 422, { message: "Reference already exists" });
    if (!commits.has(String(body.sha))) return send(res, 422, { message: "Object does not exist" });
    refs.set(name, String(body.sha));
    return send(res, 201, { ref: body.ref, object: { sha: body.sha } });
  }
  const gc = /^\/git\/commits\/([0-9a-f]+)$/.exec(rest);
  if (gc && method === "GET") {
    const cm = commits.get(gc[1]!);
    return cm ? send(res, 200, { sha: cm.sha, tree: { sha: treeShaOf(cm) }, message: cm.message }) : send(res, 404, { message: "Not Found" });
  }
  if (rest === "/git/trees" && method === "POST") {
    const body = (await readBody(req)) as { base_tree: string; tree: { path: string; sha?: null; content?: string }[] };
    const next = { ...(treeObjs.get(body.base_tree) ?? {}) };
    for (const e of body.tree) {
      if (e.content !== undefined) next[e.path] = e.content;
      else if (e.sha === null) {
        if (!(e.path in next)) return send(res, 422, { message: "GitRPC::BadObjectState" });
        delete next[e.path];
      }
    }
    const id = "t" + mkSha("ee");
    treeObjs.set(id, next);
    return send(res, 201, { sha: id });
  }
  if (rest === "/git/commits" && method === "POST") {
    const body = (await readBody(req)) as { message: string; tree: string; parents: string[] };
    const cm: MockCommit = { sha: mkSha("ab"), parent: body.parents[0] ?? null, tree: treeObjs.get(body.tree) ?? {}, message: body.message, date: new Date().toISOString() };
    commits.set(cm.sha, cm);
    return send(res, 201, { sha: cm.sha, html_url: `http://127.0.0.1:${port}/octo-dev/${repo.name}/commit/${cm.sha}`, tree: { sha: body.tree } });
  }
  const cmp = /^\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/.exec(rest);
  if (cmp) {
    const a = commits.get(cmp[1]!)?.tree ?? {};
    const z = commits.get(cmp[2]!)?.tree ?? {};
    const names = new Set([...Object.keys(a), ...Object.keys(z)]);
    return send(res, 200, { files: [...names].filter((n) => a[n] !== z[n]).map((filename) => ({ filename })) });
  }
  if (rest === "/commits") {
    const out = [];
    let cur = commits.get(refs.get(url.searchParams.get("sha") ?? "main") ?? "");
    while (cur && out.length < 10) {
      out.push({ sha: cur.sha, html_url: `http://127.0.0.1:${port}/octo-dev/${repo.name}/commit/${cur.sha}`, commit: { message: cur.message, author: { name: "Octo Developer", date: cur.date } }, author: { login: "octo-dev" } });
      cur = cur.parent ? commits.get(cur.parent) : undefined;
    }
    return send(res, 200, out);
  }
  if (rest === "/pulls") {
    const toGh = (p: (typeof pulls)[number]) => ({ number: p.number, html_url: `http://127.0.0.1:${port}/octo-dev/${repo.name}/pull/${p.number}`, title: p.title, state: p.state, draft: p.draft, merged_at: null, head: { ref: p.head }, base: { ref: p.base } });
    if (method === "GET") {
      const head = url.searchParams.get("head")?.split(":")[1];
      return send(res, 200, pulls.filter((p) => !head || p.head === head).map(toGh));
    }
    const body = (await readBody(req)) as { head: string; base: string; title: string; draft?: boolean };
    if (pulls.some((p) => p.head === body.head && p.base === body.base)) return send(res, 422, { message: `Validation Failed: A pull request already exists for octo-dev:${body.head}.` });
    if (refs.get(body.head) === refs.get(body.base)) return send(res, 422, { message: `Validation Failed: No commits between ${body.base} and ${body.head}` });
    const pr = { number: pulls.length + 1, head: body.head, base: body.base, title: body.title, state: "open" as const, draft: !!body.draft };
    pulls.push(pr);
    return send(res, 201, toGh(pr));
  }
  return send(res, 404, { message: "Not Found" });
}).listen(port, "127.0.0.1", () => console.log(`mock GitHub on http://127.0.0.1:${port}`));
