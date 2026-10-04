import { describe, expect, it } from "vitest";
import {
  MAX_TABS,
  WorkspaceError,
  closeTab,
  createFile,
  deleteFile,
  effectivePaths,
  emptyWorkspace,
  normalizePath,
  openTab,
  renameFile,
  revertAll,
  revertFile,
  saveFile,
  setDraft,
} from "./model";

const base = new Set(["README.md", "src/a.ts", "src/b.ts"]);
const ws0 = () => emptyWorkspace("sha1");

describe("normalizePath", () => {
  it("cleans leading ./ and duplicate slashes", () => {
    expect(normalizePath(" ./src//x.ts ")).toBe("src/x.ts");
    expect(normalizePath("/a.md")).toBe("a.md");
  });
  it.each(["", "src/", "../etc/passwd", "a/./b", ".git/config", "a\\b", "a:b", "x\u0000y"])("rejects %j", (p) => {
    expect(() => normalizePath(p)).toThrow(WorkspaceError);
  });
});

describe("save / draft / revert", () => {
  it("records modified files and drops changes equal to base", () => {
    let ws = saveFile(ws0(), "src/a.ts", "new", "old");
    expect(ws.changes["src/a.ts"]).toEqual({ path: "src/a.ts", status: "modified", content: "new", base: "old" });
    ws = saveFile(ws, "src/a.ts", "old", "old");
    expect(ws.changes["src/a.ts"]).toBeUndefined();
  });
  it("tracks drafts until saved", () => {
    let ws = setDraft(ws0(), "README.md", "draft", "saved");
    expect(ws.drafts["README.md"]).toBe("draft");
    expect(setDraft(ws, "README.md", "saved", "saved").drafts).toEqual({});
    ws = saveFile(ws, "README.md", "draft", "saved");
    expect(ws.drafts).toEqual({});
  });
  it("revertFile removes change + draft and closes tabs of added files", () => {
    let ws = createFile(ws0(), base, "new.ts", "x");
    ws = setDraft(ws, "new.ts", "xy", "x");
    ws = revertFile(ws, "new.ts");
    expect(ws.changes).toEqual({});
    expect(ws.drafts).toEqual({});
    expect(ws.tabs).toEqual([]);
  });
  it("revertAll clears everything", () => {
    let ws = saveFile(createFile(ws0(), base, "n.md"), "src/a.ts", "1", "0");
    ws = openTab(ws, "src/a.ts");
    ws = revertAll(ws);
    expect(ws.changes).toEqual({});
    expect(ws.tabs).toEqual(["src/a.ts"]);
  });
});

describe("create / delete / rename", () => {
  it("creates new files and refuses duplicates or folder clashes", () => {
    const ws = createFile(ws0(), base, "src/c.ts", "c");
    expect(ws.changes["src/c.ts"]?.status).toBe("added");
    expect(ws.active).toBe("src/c.ts");
    expect(() => createFile(ws, base, "src/c.ts")).toThrow(/already exists/);
    expect(() => createFile(ws0(), base, "README.md")).toThrow(/already exists/);
    expect(() => createFile(ws0(), base, "src")).toThrow(/is a folder/);
  });
  it("deleting a base file records a deletion; deleting an added file removes it", () => {
    let ws = deleteFile(ws0(), "src/a.ts", "A");
    expect(ws.changes["src/a.ts"]).toEqual({ path: "src/a.ts", status: "deleted", base: "A" });
    expect(effectivePaths([...base], ws)).toEqual(["README.md", "src/b.ts"]);
    ws = createFile(ws0(), base, "tmp.txt");
    expect(deleteFile(ws, "tmp.txt", null).changes).toEqual({});
  });
  it("re-creating a deleted base file is a modification", () => {
    let ws = deleteFile(ws0(), "src/a.ts", "A");
    ws = createFile(ws, base, "src/a.ts", "B");
    expect(ws.changes["src/a.ts"]).toMatchObject({ status: "modified", content: "B", base: "A" });
  });
  it("rename = delete + add, keeps the tab position", () => {
    let ws = openTab(openTab(ws0(), "README.md"), "src/a.ts");
    ws = renameFile(ws, base, "src/a.ts", "lib/a.ts", "A2", "A", null);
    expect(ws.changes["src/a.ts"]?.status).toBe("deleted");
    expect(ws.changes["lib/a.ts"]).toMatchObject({ status: "added", content: "A2" });
    expect(ws.tabs).toEqual(["README.md", "lib/a.ts"]);
    expect(ws.active).toBe("lib/a.ts");
    expect(() => renameFile(ws, base, "lib/a.ts", "src/b.ts", "", null, "B")).toThrow(/already exists/);
  });
});

describe("tabs", () => {
  it("opens, activates, and closes", () => {
    let ws = openTab(openTab(ws0(), "a"), "b");
    expect(ws.active).toBe("b");
    ws = closeTab(ws, "b");
    expect(ws).toMatchObject({ tabs: ["a"], active: "a" });
  });
  it("caps open tabs but never drops a tab with unsaved edits", () => {
    let ws = setDraft(openTab(ws0(), "dirty"), "dirty", "x", "");
    for (let i = 0; i < MAX_TABS + 3; i++) ws = openTab(ws, `f${i}`);
    expect(ws.tabs.length).toBe(MAX_TABS);
    expect(ws.tabs).toContain("dirty");
  });
});
