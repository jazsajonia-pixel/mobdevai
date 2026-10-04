import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { handle } from "../lib/http";

/** Repository-wide security invariants from the product requirements (Phase 7 review). */
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function files(dir: string, exts = [".ts", ".tsx"]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...files(rel, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(rel);
  }
  return out;
}

describe("secrets", () => {
  it("never exposes secret-looking VITE_* variables to the client", () => {
    const names = new Set<string>();
    for (const f of [...files("src"), "vite.config.ts"]) for (const m of read(f).matchAll(/VITE_[A-Z0-9_]+/g)) names.add(m[0]);
    for (const n of names) expect(n, n).not.toMatch(/SECRET|KEY|TOKEN|PASSWORD|PRIVATE/);
  });

  it("ignores .env files and keeps .env.example to placeholders", () => {
    const ignore = read(".gitignore").split("\n");
    expect(ignore).toContain(".env");
    expect(ignore).toContain(".env.*");
    for (const line of read(".env.example").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!m || !/SECRET|KEY|TOKEN|PASSWORD|DATABASE_URL/.test(m[1]!)) continue;
      expect(m[2], m[1]).toMatch(/^$|your-|replace-|user:password/);
    }
  });

  it("server code never logs request bodies, headers, tokens or keys", () => {
    for (const f of files("netlify").filter((f) => !f.includes("tests"))) {
      for (const m of read(f).matchAll(/console\.(log|info|warn|error|debug)\(([^;]*)\)/g)) {
        expect(m[2], `${f}: ${m[0]}`).not.toMatch(/token|secret|apiKey|api_key|authorization|cookie|headers|body/i);
      }
    }
  });
});

describe("server execution", () => {
  it("never spawns processes or evaluates code on the server", () => {
    for (const f of files("netlify").filter((f) => !f.includes("tests"))) {
      const src = read(f);
      expect(src, f).not.toMatch(/child_process|\beval\(|new Function\(|vm\.runIn/);
    }
  });
});

describe("CSRF", () => {
  it("rejects cross-site mutating requests in every handler", async () => {
    const fn = handle(["POST"], async () => new Response("ok"));
    const res = await fn(new Request("https://app.example/api/x", { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
    const ok = await fn(new Request("https://app.example/api/x", { method: "POST", headers: { origin: "https://app.example" } }));
    expect(ok.status).toBe(200);
    const fetchSite = await fn(new Request("https://app.example/api/x", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }));
    expect(fetchSite.status).toBe(403);
  });
});

describe("headers", () => {
  it("ships hardening headers", () => {
    const toml = read("netlify.toml");
    for (const h of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Strict-Transport-Security", "Content-Security-Policy"]) expect(toml).toContain(h);
    expect(toml).toMatch(/frame-ancestors 'none'/);
    expect(toml).toMatch(/object-src 'none'/);
  });
});

describe("client rendering", () => {
  it("never injects raw HTML into the app's DOM", () => {
    for (const f of files("src")) expect(read(f), f).not.toMatch(/dangerouslySetInnerHTML/);
  });
});
