import { transform } from "sucrase";
import type { BootConfig } from "./runtime";
import { runtimeScript } from "./runtime";
import type { PreviewPlanOk } from "./detect";
import { dirname, extname, joinPath, splitPackage } from "./paths";

/**
 * In-browser preview build. Turns the workspace (drafts included) into ONE self-contained HTML
 * document for a sandboxed iframe:
 *   - HTML: local <link rel=stylesheet> and classic <script src> are inlined; module scripts become
 *     bundle entries.
 *   - JS/TS/JSX/TSX: transformed per file with Sucrase (line numbers preserved), linked by a tiny
 *     CommonJS-style loader at runtime.
 *   - npm packages: loaded from esm.sh at the versions in package.json, sharing one React instance.
 *   - CSS (incl. CSS modules), JSON, SVG, ?raw / ?url imports are supported.
 * Nothing here executes repository code — it only rewrites text.
 */

export interface BuildInput {
  plan: PreviewPlanOk;
  /** HTML page to render (defaults to the plan's entry page). */
  page?: string;
  paths: readonly string[];
  /** Current content of a workspace text file; rejects if missing/binary. */
  read: (path: string) => Promise<string>;
  /** Public URL for binary assets (e.g. raw.githubusercontent.com for public repos), or null. */
  assetUrl?: (path: string) => string | null;
}

export interface BuildResult {
  html: string;
  nonce: string;
  page: string;
  root: string;
  modules: number;
  packages: string[];
  warnings: string[];
  /** Sources used, for mapping runtime errors to code frames. */
  sources: Map<string, string>;
  durationMs: number;
}

export class BuildError extends Error {
  constructor(
    message: string,
    readonly file: string | null = null,
    readonly line: number | null = null,
    readonly column: number | null = null,
    readonly frame: string | null = null,
  ) {
    super(message);
    this.name = "BuildError";
  }
}

const MAX_MODULES = 800;
const MAX_SOURCE_CHARS = 10_000_000;
const SCRIPT_EXT = ["tsx", "ts", "jsx", "js", "mjs", "cjs", "mts", "cts"];
const RESOLVE_EXT = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json", ".css"];
const BINARY_ASSET = /\.(png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp3|mp4|webm|ogg|wav|pdf)$/i;
const NODE_BUILTINS = new Set(
  "assert buffer child_process cluster crypto dgram dns events fs http http2 https net os path perf_hooks process querystring readline stream string_decoder timers tls tty url util v8 vm worker_threads zlib".split(" "),
);
const UNSUPPORTED_EXT: Record<string, string> = {
  vue: "Vue single-file components need the Vue compiler",
  svelte: "Svelte components need the Svelte compiler",
  scss: "Sass isn't compiled in the preview",
  sass: "Sass isn't compiled in the preview",
  less: "Less isn't compiled in the preview",
  styl: "Stylus isn't compiled in the preview",
};

export function codeFrame(source: string, line: number, column: number | null): string {
  const lines = source.split("\n");
  const from = Math.max(1, line - 2);
  const to = Math.min(lines.length, line + 2);
  const width = String(to).length;
  const out: string[] = [];
  for (let n = from; n <= to; n++) {
    out.push(`${n === line ? ">" : " "} ${String(n).padStart(width)} | ${lines[n - 1] ?? ""}`);
    if (n === line && column !== null) out.push(`  ${" ".repeat(width)} | ${" ".repeat(Math.max(0, column))}^`);
  }
  return out.join("\n");
}

/** Strip comments and trailing commas from tsconfig-style JSON. */
function parseJsonc(text: string): unknown {
  const noComments = text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, str: string | undefined) => str ?? "");
  return JSON.parse(noComments.replace(/,(\s*[}\]])/g, "$1"));
}

function cleanVersion(range: string | undefined): string | null {
  if (!range) return null;
  const r = range.trim();
  if (/^(workspace:|file:|link:|git|https?:|github:|\.|\/)/.test(r)) return null;
  if (r === "*" || r === "latest" || r === "") return null;
  const m = /\d+(\.\d+){0,2}(-[\w.]+)?/.exec(r);
  return m ? m[0] : null;
}

interface Alias {
  prefix: string;
  target: string; // repo path prefix
}

type Dep = { path: string } | { ext: string };

export async function buildPreview(input: BuildInput): Promise<BuildResult> {
  const started = performance.now();
  const { plan } = input;
  const pathSet = new Set(input.paths);
  const exists = (p: string) => pathSet.has(p);
  const warnings: string[] = [];
  const warnOnce = (w: string) => void (warnings.includes(w) || warnings.push(w));
  const sources = new Map<string, string>();
  let totalChars = 0;

  const readText = async (p: string): Promise<string> => {
    const cached = sources.get(p);
    if (cached !== undefined) return cached;
    let text: string;
    try {
      text = await input.read(p);
    } catch (e) {
      throw new BuildError(`Couldn't read ${p}: ${e instanceof Error ? e.message : "unreadable"}`, p);
    }
    totalChars += text.length;
    if (totalChars > MAX_SOURCE_CHARS) throw new BuildError("The project is too large to preview in the browser (over 10 MB of source).");
    sources.set(p, text);
    return text;
  };

  /* ── aliases (tsconfig paths, common vite aliases) ── */
  const aliases: Alias[] = [];
  for (const cfg of ["tsconfig.json", "tsconfig.app.json", "jsconfig.json"].map((f) => plan.root + f)) {
    if (!exists(cfg)) continue;
    try {
      const json = parseJsonc(await readText(cfg)) as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
      const base = joinPath(plan.root, (json.compilerOptions?.baseUrl ?? ".") + "/") ?? "";
      for (const [key, targets] of Object.entries(json.compilerOptions?.paths ?? {})) {
        const t = targets[0];
        if (!t) continue;
        const target = joinPath(base ? `${base}/` : "", t.replace(/\*$/, ""));
        if (target !== null) aliases.push({ prefix: key.replace(/\*$/, ""), target: target && t.endsWith("*") ? `${target}/` : target });
      }
    } catch {
      warnOnce(`Couldn't parse ${cfg}; path aliases from it are ignored.`);
    }
  }
  const viteCfg = input.paths.find((p) => p.startsWith(plan.root) && /^vite\.config\.(js|ts|mjs|mts)$/.test(p.slice(plan.root.length)));
  if (viteCfg) {
    const text = await readText(viteCfg).catch(() => "");
    for (const m of text.matchAll(/['"]?([@~][\w-]*|#[\w-]+)['"]?\s*:\s*[^,\n}]*?['"`]\.?\/?((?:src|app|lib)[\w/-]*)['"`]/g)) {
      const prefix = `${m[1]}/`;
      if (!aliases.some((a) => a.prefix === prefix)) aliases.push({ prefix, target: `${plan.root}${m[2]!.replace(/\/$/, "")}/` });
    }
  }
  if (!aliases.some((a) => a.prefix === "@/") && exists(`${plan.root}src`) === false && input.paths.some((p) => p.startsWith(`${plan.root}src/`))) {
    aliases.push({ prefix: "@/", target: `${plan.root}src/` }); // common convention; only used if nothing else matches
  }

  /* ── npm packages via esm.sh ── */
  const react = plan.framework === "react";
  const preact = plan.framework === "preact";
  const peerExternal = react ? ["react", "react-dom"].filter((d) => d in plan.deps || d === "react") : preact ? ["preact"] : [];
  const externals = new Map<string, string>(); // url → package
  const pkgUrl = (spec: string): string => {
    const [name, sub] = splitPackage(spec);
    const ver = cleanVersion(plan.deps[name]);
    if (!(name in plan.deps)) warnOnce(`"${name}" isn't in package.json — loading the latest version from esm.sh.`);
    const flags = ["dev"];
    if (name === "react" || name === "preact") {
      /* the shared instance */
    } else if (name === "react-dom") flags.push("external=react");
    else if (peerExternal.length) flags.push(`external=${peerExternal.join(",")}`);
    return `https://esm.sh/${name}${ver ? `@${ver}` : ""}${sub}?${flags.join("&")}`;
  };
  const importMap: Record<string, string> = {};
  const shared = react
    ? ["react", "react/jsx-runtime", "react/jsx-dev-runtime", ...("react-dom" in plan.deps ? ["react-dom", "react-dom/client", "react-dom/server"] : [])]
    : preact
      ? ["preact", "preact/hooks", "preact/jsx-runtime", "preact/compat"]
      : [];
  for (const s of shared) importMap[s] = pkgUrl(s);
  const cssLinks: string[] = [];

  /* ── assets ── */
  const assetRef = async (repoPath: string, from: string): Promise<string> => {
    if (/\.svg$/i.test(repoPath) && exists(repoPath)) {
      const svg = await readText(repoPath).catch(() => null);
      if (svg !== null) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
    const url = exists(repoPath) ? (input.assetUrl?.(repoPath) ?? null) : null;
    if (url) return url;
    if (!exists(repoPath)) warnOnce(`${from}: asset not found: ${repoPath}`);
    else warnOnce("Images and fonts from this repository can't be shown in the preview (private repo) — SVGs still work.");
    return "";
  };
  /** Resolve a URL used in HTML/CSS to a repo path (Vite: "/x" → public/x or root/x). */
  const resolveUrlPath = (url: string, fromDir: string): string | null => {
    const clean = url.split(/[?#]/)[0]!;
    if (clean.startsWith("/")) {
      const pub = `${plan.root}public${clean}`;
      if (exists(pub)) return pub;
      return joinPath(plan.root, clean.slice(1));
    }
    return joinPath(fromDir, clean);
  };
  const isLocalUrl = (u: string) => !!u && !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);

  /* ── CSS ── */
  const processCss = async (css: string, file: string, seen = new Set<string>()): Promise<string> => {
    seen.add(file);
    let out = css;
    // Inline local @import (one level of nesting per file, cycles skipped).
    const imports = [...out.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/g)];
    for (const m of imports) {
      const spec = m[1]!;
      if (spec === "tailwindcss" || /^tailwindcss\//.test(spec)) continue;
      if (!isLocalUrl(spec)) continue;
      const target = spec.startsWith(".") || spec.startsWith("/") ? resolveUrlPath(spec, dirname(file)) : null;
      if (!target || !exists(target) || seen.has(target)) {
        if (!target || !exists(target)) {
          // bare package CSS, e.g. @import "normalize.css"
          if (!spec.startsWith(".") && !spec.startsWith("/")) {
            out = out.replace(m[0], `@import url("${cdnCss(spec)}");`);
          } else warnOnce(`${file}: @import not found: ${spec}`);
        }
        continue;
      }
      out = out.replace(m[0], await processCss(await readText(target), target, seen));
    }
    // url(...) → data:/public URL
    const urls = [...new Set([...out.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]!))].filter(isLocalUrl);
    for (const u of urls) {
      const target = resolveUrlPath(u, dirname(file));
      if (!target) continue;
      const ref = await assetRef(target, file);
      if (ref) out = out.split(u).join(ref);
    }
    return out;
  };
  const cdnCss = (spec: string) => {
    const [name, sub] = splitPackage(spec);
    const ver = cleanVersion(plan.deps[name]);
    return `https://cdn.jsdelivr.net/npm/${name}${ver ? `@${ver}` : ""}${sub}`;
  };
  const isTailwindCss = (css: string) => /@tailwind\s|@import\s+['"]tailwindcss|@apply\s|@theme\s*\{/.test(css);

  /* ── module graph ── */
  const modules: BootConfig["modules"] = {};
  const queue: string[] = [];
  const scheduled = new Set<string>();
  const schedule = (id: string) => {
    if (!scheduled.has(id)) {
      scheduled.add(id);
      queue.push(id);
    }
  };

  const tryFile = (base: string): string | null => {
    if (exists(base) && extname(base)) return base;
    for (const e of RESOLVE_EXT) if (exists(base + e)) return base + e;
    for (const e of RESOLVE_EXT) if (exists(`${base}/index${e}`)) return `${base}/index${e}`;
    // TS ESM style: import "./x.js" → x.ts / x.tsx
    const js = /\.(m|c)?jsx?$/.exec(base);
    if (js) {
      const stem = base.slice(0, -js[0].length);
      for (const e of [".ts", ".tsx", ".mts", ".cts"]) if (exists(stem + e)) return stem + e;
    }
    return null;
  };

  /** string = local file, null = local but missing, "bare" = npm package. */
  const resolveLocal = (spec: string, from: string): string | null | { bare: true } => {
    if (spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") {
      const p = joinPath(dirname(from), spec);
      return p === null ? null : tryFile(p);
    }
    if (spec.startsWith("/")) return tryFile(joinPath(plan.root, spec.slice(1)) ?? "");
    for (const a of [...aliases].sort((x, y) => y.prefix.length - x.prefix.length)) {
      if (spec === a.prefix.replace(/\/$/, "") || spec.startsWith(a.prefix)) {
        const hit = tryFile(a.target + spec.slice(a.prefix.length));
        if (hit) return hit;
      }
    }
    return { bare: true };
  };

  const lineOf = (source: string, needle: string): number | null => {
    const i = source.indexOf(needle);
    return i < 0 ? null : source.slice(0, i).split("\n").length;
  };

  /** Map one require() specifier to a module id or an external URL. */
  const link = (rawSpec: string, from: string, original: string): Dep => {
    const [spec, query = ""] = rawSpec.split("?") as [string, string?];
    const local = resolveLocal(spec, from);
    if (local === null) {
      const line = lineOf(original, rawSpec);
      throw new BuildError(`Cannot resolve "${rawSpec}" from ${from}.`, from, line, null, line ? codeFrame(original, line, null) : null);
    }
    if (typeof local === "string") {
      const id = query ? `${local}?${query}` : local;
      schedule(id);
      return { path: id };
    }
    // bare specifier → npm package
    const [name] = splitPackage(spec);
    const builtin = name.startsWith("node:") ? name.slice(5) : name;
    if (NODE_BUILTINS.has(builtin)) {
      const line = lineOf(original, rawSpec);
      throw new BuildError(`"${rawSpec}" is a Node.js built-in module and can't run in the browser.`, from, line, null, line ? codeFrame(original, line, null) : null);
    }
    if (/\.css$/.test(spec)) {
      const id = `css-pkg:${spec}`;
      if (!modules[id]) {
        cssLinks.push(cdnCss(spec));
        modules[id] = { code: "", deps: {} };
      }
      return { path: id };
    }
    const url = importMap[spec] ?? pkgUrl(spec);
    externals.set(url, name);
    return { ext: url };
  };

  const compileScript = async (id: string, file: string): Promise<void> => {
    const original = await readText(file);
    const ext = extname(file);
    if (/import\.meta\.glob\s*[(<]/.test(original)) {
      const line = lineOf(original, "import.meta.glob");
      throw new BuildError("import.meta.glob isn't supported in the browser preview yet.", file, line, null, line ? codeFrame(original, line, null) : null);
    }
    const pre = original
      .replace(/\bimport\.meta\.env\b/g, "__mdai_env")
      .replace(/\bimport\.meta\.hot\b/g, "undefined")
      .replace(/\bimport\.meta\.url\b/g, JSON.stringify(`preview:///${file}`))
      .replace(/\bimport\.meta\b/g, `({ url: ${JSON.stringify(`preview:///${file}`)}, env: __mdai_env })`);
    const isTs = ext === "ts" || ext === "tsx" || ext === "mts" || ext === "cts";
    const jsx = ext !== "ts" && ext !== "mts" && ext !== "cts";
    let code: string;
    try {
      code = transform(pre, {
        transforms: [...(isTs ? (["typescript"] as const) : []), ...(jsx ? (["jsx"] as const) : []), "imports"],
        jsxRuntime: "automatic",
        jsxImportSource: preact ? "preact" : "react",
        production: true,
        filePath: file,
        disableESTransforms: true,
      }).code;
    } catch (e) {
      const err = e as Error & { loc?: { line: number; column: number } };
      const line = err.loc?.line ?? null;
      const col = err.loc?.column ?? null;
      throw new BuildError(err.message.replace(/^Error transforming [^:]+: /, ""), file, line, col, line ? codeFrame(original, line, col) : null);
    }
    const deps: Record<string, Dep> = {};
    for (const m of code.matchAll(/\brequire\(\s*(['"])([^'"\n]+)\1\s*\)/g)) {
      const spec = m[2]!;
      if (!deps[spec]) deps[spec] = link(spec, file, original);
    }
    modules[id] = { code, deps };
  };

  const compile = async (id: string): Promise<void> => {
    const [file, query = ""] = id.split("?") as [string, string?];
    const ext = extname(file);
    const esm = (expr: string) => `Object.defineProperty(exports, "__esModule", { value: true }); exports.default = ${expr};`;
    if (UNSUPPORTED_EXT[ext]) {
      if (ext === "vue" || ext === "svelte") throw new BuildError(`${UNSUPPORTED_EXT[ext]} — ${file} can't be previewed yet.`, file);
      warnOnce(`${UNSUPPORTED_EXT[ext]}; styles from ${file} are missing.`);
      modules[id] = { code: "", deps: {} };
      return;
    }
    if (query === "raw" || (query.startsWith("raw") && !query.includes("url"))) {
      modules[id] = { code: esm(JSON.stringify(await readText(file))), deps: {} };
      return;
    }
    if (query === "url" || BINARY_ASSET.test(file) || (ext === "svg" && query !== "react") || ext === "html" || ext === "txt") {
      const ref = ext === "html" || ext === "txt" ? "" : await assetRef(file, file);
      modules[id] = { code: esm(JSON.stringify(ref)), deps: {} };
      return;
    }
    if (ext === "svg" && query === "react") throw new BuildError("SVG-as-component imports (?react, vite-plugin-svgr) aren't supported in the preview yet.", file);
    if (ext === "json") {
      const text = await readText(file);
      try {
        JSON.parse(text);
      } catch (e) {
        throw new BuildError(`Invalid JSON: ${e instanceof Error ? e.message : ""}`, file);
      }
      modules[id] = { code: `module.exports = ${text};`, deps: {} };
      return;
    }
    if (ext === "css") {
      let css = await processCss(await readText(file), file);
      let exportsCode = "";
      if (/\.module\.css$/.test(file)) {
        const map: Record<string, string> = {};
        const tag = file.replace(/[^a-z0-9]/gi, "_").slice(-24);
        // Rename classes in selectors only (text before "{", skipping @-rules).
        css = css.replace(/([^{}]+)\{/g, (m, sel: string) =>
          sel.trim().startsWith("@")
            ? m
            : `${sel.replace(/\.(-?[_a-zA-Z][\w-]*)/g, (_c, name: string) => {
                map[name] = `${name}_${tag}`;
                return `.${map[name]}`;
              })}{`,
        );
        exportsCode = esm(JSON.stringify(map));
      }
      const tw = !!plan.tailwind && isTailwindCss(css);
      modules[id] = { code: `window.__mdai_css(${JSON.stringify(file)}, ${JSON.stringify(css)}, ${tw});${exportsCode}`, deps: {} };
      return;
    }
    if (SCRIPT_EXT.includes(ext)) return compileScript(id, file);
    modules[id] = { code: esm(JSON.stringify("")), deps: {} };
    warnOnce(`Imports of .${ext} files aren't supported in the preview (${file}).`);
  };

  /* ── HTML ── */
  const page = input.page ?? plan.html;
  if (!exists(page)) throw new BuildError(`${page} doesn't exist.`, page);
  const htmlText = (await readText(page)).replace(/%PUBLIC_URL%/g, "");
  const doc = new DOMParser().parseFromString(htmlText, "text/html");
  const pageDir = dirname(page);
  const entries: string[] = [];
  let inline = 0;

  for (const el of [...doc.querySelectorAll("script")]) {
    const src = el.getAttribute("src");
    const isModule = el.getAttribute("type") === "module";
    if (src && isLocalUrl(src)) {
      const target = resolveUrlPath(src, pageDir);
      const file = target ? tryFile(target) : null;
      if (!file) throw new BuildError(`${page} loads a script that doesn't exist: ${src}`, page, lineOf(htmlText, src));
      if (isModule) {
        schedule(file);
        entries.push(file);
        el.remove();
      } else {
        el.removeAttribute("src");
        el.textContent = (await readText(file)).replace(/<\/script/gi, "<\\/script");
      }
    } else if (isModule && !src) {
      const id = `${page}#inline-${++inline}.js`;
      sources.set(id, el.textContent ?? "");
      pathSet.add(id);
      schedule(id);
      entries.push(id);
      el.remove();
    }
  }
  if (plan.entry && !entries.length) {
    schedule(plan.entry);
    entries.push(plan.entry);
  }
  for (const el of [...doc.querySelectorAll('link[rel~="stylesheet"][href]')]) {
    const href = el.getAttribute("href")!;
    if (!isLocalUrl(href)) continue;
    const target = resolveUrlPath(href, pageDir);
    if (!target || !exists(target)) {
      warnOnce(`${page}: stylesheet not found: ${href}`);
      el.remove();
      continue;
    }
    if (UNSUPPORTED_EXT[extname(target)]) {
      warnOnce(`${UNSUPPORTED_EXT[extname(target)]}; ${target} is skipped.`);
      el.remove();
      continue;
    }
    const style = doc.createElement("style");
    const css = await processCss(await readText(target), target);
    style.setAttribute("data-file", target);
    if (plan.tailwind && isTailwindCss(css)) style.setAttribute("type", "text/tailwindcss");
    style.textContent = css;
    el.replaceWith(style);
  }
  for (const el of [...doc.querySelectorAll("img[src], source[src], video[src], audio[src], link[rel~='icon'][href], link[rel='apple-touch-icon'][href], img[srcset]")]) {
    const attr = el.hasAttribute("src") ? "src" : "href";
    const v = el.getAttribute(attr);
    if (!v || !isLocalUrl(v)) continue;
    const target = resolveUrlPath(v, pageDir);
    if (target) el.setAttribute(attr, await assetRef(target, page));
  }
  // Inline <style> blocks with url() references
  for (const el of [...doc.querySelectorAll("style")]) {
    if (el.getAttribute("data-file")) continue;
    el.textContent = await processCss(el.textContent ?? "", page);
  }

  // Build the module graph breadth-first.
  while (queue.length) {
    if (Object.keys(modules).length > MAX_MODULES) throw new BuildError(`More than ${MAX_MODULES} modules — too large for the browser preview.`);
    const batch = queue.splice(0, 8);
    await Promise.all(batch.map(compile));
  }

  /* ── assemble ── */
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const cfg: BootConfig = {
    modules,
    entries,
    externals: Object.fromEntries(externals),
    env: { MODE: "development", DEV: true, PROD: false, SSR: false, BASE_URL: "/" },
    nonce,
  };
  // JSON in <script>: escape "<" so no file content can close the tag.
  const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const head = doc.head;
  const first = head.firstChild;
  const add = (html: string) => {
    const tpl = doc.createElement("template");
    tpl.innerHTML = html;
    head.insertBefore(tpl.content, first);
  };
  const tailwindTag =
    plan.tailwind === 4 ? '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>' : plan.tailwind === 3 ? '<script src="https://cdn.tailwindcss.com/3.4.17"></script>' : "";
  add(
    [
      '<meta charset="utf-8">',
      ...(doc.querySelector('meta[name="viewport"]') ? [] : ['<meta name="viewport" content="width=device-width, initial-scale=1">']),
      `<script>${runtimeScript(nonce)}\nwindow.process = window.process || { env: { NODE_ENV: "development", PUBLIC_URL: "" } };</script>`,
      `<script type="importmap">${safeJson({ imports: importMap })}</script>`,
      ...cssLinks.map((h) => `<link rel="stylesheet" href="${h}">`),
      tailwindTag,
    ].join(""),
  );
  const boot = doc.createElement("script");
  boot.textContent = `window.__mdai_boot(${safeJson(cfg)});`;
  doc.body.appendChild(boot);

  if (plan.tailwind) warnOnce(`Tailwind CSS v${plan.tailwind} is generated in the browser (tailwind.config customisations aren't applied).`);
  const html = `<!doctype html>\n${doc.documentElement.outerHTML}`;
  return {
    html,
    nonce,
    page,
    root: plan.root,
    modules: Object.keys(modules).length,
    packages: [...new Set(externals.values())],
    warnings,
    sources,
    durationMs: Math.round(performance.now() - started),
  };
}
