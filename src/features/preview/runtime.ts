/**
 * Sandbox flags for every preview frame. Deliberately NO allow-same-origin: the frame gets an
 * opaque origin, so project code can't read this app's cookies/storage or call its API.
 */
export const PREVIEW_SANDBOX = "allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox";

/**
 * Code that runs INSIDE the sandboxed preview iframe (opaque origin — no access to this app's
 * cookies, storage or API). It is serialised with Function#toString, so it must be self-contained:
 * no imports, no references to outer variables.
 *
 * - Bridges console output, errors and page navigation to the parent via postMessage.
 * - Shims storage/cookies (they throw in opaque-origin frames) with in-memory versions.
 * - Provides a tiny CommonJS-style module loader for the bundled app.
 */

export interface BootConfig {
  modules: Record<string, { code: string; deps: Record<string, { path: string } | { ext: string }> }>;
  entries: string[];
  externals: Record<string, string>; // url → package name
  env: Record<string, unknown>;
  nonce: string;
}

/* eslint-disable */
function previewRuntime(nonce: string) {
  const w = window as any;
  const post = (type: string, data: Record<string, unknown>) => {
    try {
      parent.postMessage({ __mdai: nonce, type, ...data }, "*");
    } catch {
      /* ignore */
    }
  };

  const fmt = (v: unknown, depth = 0): string => {
    if (typeof v === "string") return v;
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (typeof v === "function") return `ƒ ${(v as Function).name || "anonymous"}()`;
    if (typeof v !== "object" || v === null) return String(v);
    if (typeof Element !== "undefined" && v instanceof Element) return `<${v.tagName.toLowerCase()}${v.id ? `#${v.id}` : ""}>`;
    if (depth > 2) return Array.isArray(v) ? "[…]" : "{…}";
    try {
      if (Array.isArray(v)) return `[${v.slice(0, 20).map((x) => fmt(x, depth + 1)).join(", ")}${v.length > 20 ? ", …" : ""}]`;
      const keys = Object.keys(v).slice(0, 20);
      return `{${keys.map((k) => `${k}: ${fmt((v as any)[k], depth + 1)}`).join(", ")}${Object.keys(v).length > 20 ? ", …" : ""}}`;
    } catch {
      return "[object]";
    }
  };

  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      post("console", { level, text: args.map((a) => fmt(a)).join(" ").slice(0, 4000) });
      orig(...args);
    };
  }

  const report = (err: unknown, kind: string) => {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : fmt(err));
    post("error", { kind, message: `${e.name}: ${e.message}`.slice(0, 2000), stack: String(e.stack || "").slice(0, 4000) });
  };
  w.addEventListener("error", (ev: ErrorEvent) => {
    if (ev.error || ev.message) report(ev.error || ev.message, "runtime");
  });
  w.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => report(ev.reason, "promise"));

  // Storage + cookies throw SecurityError in opaque-origin frames; give apps in-memory versions.
  const memStorage = () => {
    const m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => (m.has(String(k)) ? m.get(String(k))! : null),
      setItem: (k: string, v: unknown) => void m.set(String(k), String(v)),
      removeItem: (k: string) => void m.delete(String(k)),
      clear: () => m.clear(),
    };
  };
  for (const name of ["localStorage", "sessionStorage"]) {
    try {
      void w[name].length;
    } catch {
      try {
        Object.defineProperty(w, name, { value: memStorage(), configurable: true });
      } catch {
        /* ignore */
      }
    }
  }
  try {
    void document.cookie;
  } catch {
    let jar = "";
    try {
      Object.defineProperty(document, "cookie", { get: () => jar, set: (v: string) => void (jar = String(v).split(";")[0] || ""), configurable: true });
    } catch {
      /* ignore */
    }
  }
  // History API can't change the URL of an about:srcdoc document; keep SPAs from crashing.
  for (const fn of ["pushState", "replaceState"] as const) {
    const orig = history[fn].bind(history);
    history[fn] = (state: unknown, title: string, url?: string | URL | null) => {
      try {
        orig(state, title, url);
      } catch {
        orig(state, title);
        post("console", { level: "warn", text: `[preview] ${fn}("${String(url)}") can't change the URL inside the preview frame. Path-based routers may not match routes — HashRouter/MemoryRouter work.` });
      }
    };
  }

  // Multi-page sites: local links are handled by the parent (it rebuilds with that page).
  document.addEventListener(
    "click",
    (ev) => {
      const a = (ev.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || ev.defaultPrevented) return;
      const href = a.getAttribute("href") || "";
      if (/^(#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) {
        if (/^https?:|^\/\//i.test(href) && a.target !== "_blank") {
          ev.preventDefault();
          w.open(a.href, "_blank", "noopener");
        }
        return;
      }
      ev.preventDefault();
      post("navigate", { href });
    },
    true,
  );
  document.addEventListener(
    "submit",
    (ev) => {
      const f = ev.target as HTMLFormElement;
      const action = f.getAttribute("action");
      if (!action || !/^https?:/i.test(action)) {
        if (!ev.defaultPrevented) {
          ev.preventDefault();
          post("console", { level: "warn", text: "[preview] A form was submitted without a handler — page navigation is blocked inside the preview." });
        }
      }
    },
    false,
  );

  const styles = new Map<string, HTMLStyleElement>();
  w.__mdai_css = (id: string, css: string, tailwind?: boolean) => {
    let el = styles.get(id);
    if (!el) {
      el = document.createElement("style");
      el.setAttribute("data-file", id);
      if (tailwind) el.setAttribute("type", "text/tailwindcss");
      document.head.appendChild(el);
      styles.set(id, el);
    }
    el.textContent = css;
  };

  w.__mdai_boot = (cfg: BootConfig) => {
    const cache: Record<string, { exports: any }> = {};
    const ext: Record<string, any> = {};
    const interop = (ns: any) => {
      const out: any = Object.create(null);
      for (const k of Object.keys(ns)) out[k] = ns[k];
      if (!("default" in out)) out.default = ns;
      Object.defineProperty(out, "__esModule", { value: true });
      return out;
    };
    const load = (path: string): any => {
      const hit = cache[path];
      if (hit) return hit.exports;
      const def = cfg.modules[path];
      if (!def) throw new Error(`Module not in the preview bundle: ${path}`);
      const module = { exports: {} as any };
      cache[path] = module;
      const req = (spec: string) => {
        const t = def.deps[spec];
        if (!t) throw new Error(`Cannot resolve "${spec}" from ${path} (dynamic or unsupported import).`);
        return "ext" in t ? ext[t.ext] : load(t.path);
      };
      const fn = (0, eval)(`(function (require, module, exports, __mdai_env) {${def.code}\n})\n//# sourceURL=preview:///${path}`);
      fn(req, module, module.exports, cfg.env);
      return module.exports;
    };
    const urls = Object.keys(cfg.externals);
    // Built at runtime so the app's own bundler never rewrites this dynamic import.
    const dynImport = new Function("u", "return import(u)") as (u: string) => Promise<any>;
    Promise.all(
      urls.map((u) =>
        dynImport(u).then(
          (ns) => void (ext[u] = interop(ns)),
          (err) => {
            throw new Error(`Couldn't load the npm package "${cfg.externals[u]}" from esm.sh (${err instanceof Error ? err.message : "network error"}). Check the package name/version or your connection.`);
          },
        ),
      ),
    )
      .then(() => {
        for (const e of cfg.entries) load(e);
        post("ready", {});
      })
      .catch((err) => {
        report(err, "boot");
        post("ready", { failed: true });
      });
  };

  post("boot", {});
}
/* eslint-enable */

/** Source of the runtime as an IIFE string for injection. */
export function runtimeScript(nonce: string): string {
  return `(${previewRuntime.toString()})(${JSON.stringify(nonce)});`;
}
