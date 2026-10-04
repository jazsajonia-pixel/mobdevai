/** Small POSIX path helpers for repo-relative paths ("src/App.tsx", no leading slash). */

export function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i + 1);
}

/** Join + normalise; returns null if the path escapes the repo root. */
export function joinPath(base: string, rel: string): string | null {
  const parts = (base + rel).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join("/");
}

export function extname(p: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(p);
  return m ? m[1]!.toLowerCase() : "";
}

/** "@scope/pkg/sub/path" → ["@scope/pkg", "/sub/path"]. */
export function splitPackage(spec: string): [name: string, sub: string] {
  const parts = spec.split("/");
  const n = spec.startsWith("@") ? 2 : 1;
  return [parts.slice(0, n).join("/"), parts.length > n ? `/${parts.slice(n).join("/")}` : ""];
}
