import { describe, expect, it } from "vitest";
import { buildTree, detectProjectKind } from "./tree";
import { SAMPLE_FILES as DEMO_FILES } from "@/test/sample-project";

describe("buildTree", () => {
  it("nests paths and sorts folders before files", () => {
    const tree = buildTree([{ path: "README.md" }, { path: "src/b.ts" }, { path: "src/a/c.ts" }, { path: "index.html" }]);
    expect(tree.map((n) => n.name)).toEqual(["src", "index.html", "README.md"]);
    const src = tree[0]!;
    expect(src.children?.map((n) => `${n.type}:${n.name}`)).toEqual(["dir:a", "file:b.ts"]);
    expect(src.children?.[0]?.children?.[0]?.path).toBe("src/a/c.ts");
  });
});

describe("detectProjectKind", () => {
  it("detects the sample app as Vite + React", () => {
    expect(detectProjectKind(DEMO_FILES)).toBe("vite-react");
  });
  it("detects plain static sites", () => {
    expect(detectProjectKind([{ path: "index.html", content: "<h1>hi</h1>" }])).toBe("static-html");
  });
  it("returns unknown for invalid package.json instead of throwing", () => {
    expect(detectProjectKind([{ path: "package.json", content: "{ not json" }])).toBe("unknown");
  });
  it("returns unknown for server-only projects", () => {
    expect(detectProjectKind([{ path: "main.py", content: "print(1)" }])).toBe("unknown");
  });
});
