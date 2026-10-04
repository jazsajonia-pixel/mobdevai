/**
 * Lightweight local runner for Netlify Functions (v2 handlers with `config.path`).
 * `npm run dev:api` serves them on :8787 and Vite proxies /api there. Use `netlify dev` for
 * full parity; this exists so the app runs locally without the Netlify CLI.
 */
import { createServer } from "node:http";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

try {
  process.loadEnvFile?.(".env");
} catch {
  /* no .env file */
}

type Fn = (req: Request, ctx: { params: Record<string, string>; ip: string }) => Promise<Response>;
interface Route {
  name: string;
  regex: RegExp;
  keys: string[];
  fn: Fn;
}

const dir = join(process.cwd(), "netlify", "functions");
const routes: Route[] = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
  const mod = (await import(pathToFileURL(join(dir, file)).href)) as { default: Fn; config?: { path?: string } };
  const path = mod.config?.path;
  if (!path) continue;
  const keys: string[] = [];
  const regex = new RegExp(
    "^" + path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:(\w+)/g, (_, k: string) => (keys.push(k), "([^/]+)")) + "$",
  );
  routes.push({ name: file, regex, keys, fn: mod.default });
}

const port = Number(process.env.DEV_API_PORT ?? 8787);
createServer(async (req, res) => {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? `127.0.0.1:${port}`;
  const url = new URL(req.url ?? "/", `http://${host}`);
  const route = routes.find((r) => r.regex.test(url.pathname));
  if (!route) {
    res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: { code: "NOT_FOUND", message: "No function" } }));
    return;
  }
  const m = route.regex.exec(url.pathname)!;
  const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1] ?? "")]));
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const request = new Request(url, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
  });
  const response = await route.fn(request, { params, ip: req.socket.remoteAddress ?? "local" });
  const out: Record<string, string | string[]> = {};
  response.headers.forEach((v, k) => {
    if (k !== "set-cookie") out[k] = v;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) out["set-cookie"] = cookies;
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
  console.log(`${req.method} ${url.pathname} → ${response.status} (${route.name})`);
}).listen(port, "127.0.0.1", () => console.log(`functions on http://127.0.0.1:${port} (${routes.length} routes)`));
