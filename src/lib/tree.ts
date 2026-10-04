import type { ProjectKind, TreeNode, WorkspaceFile } from "@/types/workspace";

/** Build a sorted folder-first tree from flat file paths. */
export function buildTree(files: readonly Pick<WorkspaceFile, "path">[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };

  for (const { path } of files) {
    const parts = path.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const childPath = parts.slice(0, i + 1).join("/");
      node.children ??= [];
      let next = node.children.find((c) => c.name === part);
      if (!next) {
        next = isFile
          ? { name: part, path: childPath, type: "file" }
          : { name: part, path: childPath, type: "dir", children: [] };
        node.children.push(next);
      }
      node = next;
    });
  }

  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1))
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n));

  return sort(root.children ?? []);
}

/**
 * Detect what kind of project this is, for preview support decisions (Phase 5).
 * Only inspects package.json *as data* — repository content is never executed or trusted.
 */
export function detectProjectKind(files: readonly WorkspaceFile[]): ProjectKind {
  const pkgFile = files.find((f) => f.path === "package.json");
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if ("vite" in deps && "react" in deps) return "vite-react";
      if ("vite" in deps && "typescript" in deps) return "vite-ts";
    } catch {
      return "unknown";
    }
    return "unknown";
  }
  if (files.some((f) => f.path === "index.html")) return "static-html";
  return "unknown";
}

export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = {
  "static-html": "HTML / CSS / JS",
  "vite-react": "Vite + React",
  "vite-ts": "Vite + TypeScript",
  unknown: "Unknown runtime",
};

export function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TSX",
    js: "JavaScript",
    jsx: "JSX",
    json: "JSON",
    css: "CSS",
    html: "HTML",
    md: "Markdown",
  };
  return map[ext] ?? "Text";
}
