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

const branches = ["main", "feature/mobile-nav", "dev"].map((name, i) => ({ name, commit: { sha: `c0ffee${i}`.padEnd(40, "0") }, protected: name === "main" }));

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
  if (rest === "/branches") return send(res, 200, branches);
  const b = /^\/branches\/(.+)$/.exec(rest);
  if (b) {
    const br = branches.find((x) => x.name === decodeURIComponent(b[1]!));
    return br ? send(res, 200, { ...br, commit: { sha: br.commit.sha, commit: { tree: { sha: "tree-" + br.name } } } }) : send(res, 404, { message: "Branch not found" });
  }
  if (rest.startsWith("/git/trees/")) {
    const dirs = new Set<string>();
    for (const f of Object.keys(files)) f.split("/").slice(0, -1).forEach((_, i, a) => dirs.add(a.slice(0, i + 1).join("/")));
    const tree = [...[...dirs].map((d) => ({ path: d, type: "tree" })), ...Object.entries(files).map(([path, c]) => ({ path, type: "blob", size: c.length }))];
    return send(res, 200, { sha: "tree", truncated: false, tree });
  }
  const c = /^\/contents\/(.+)$/.exec(rest);
  if (c) {
    const path = decodeURIComponent(c[1]!);
    const content = files[path];
    if (content === undefined) return send(res, 404, { message: "Not Found" });
    return send(res, 200, { type: "file", path, sha: "blob-" + path, size: content.length, encoding: "base64", content: Buffer.from(content).toString("base64") });
  }
  return send(res, 404, { message: "Not Found" });
}).listen(port, "127.0.0.1", () => console.log(`mock GitHub on http://127.0.0.1:${port}`));
