import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorStateCache } from "./state-cache";

describe("EditorStateCache", () => {
  it("ignores stale writes after invalidation", () => {
    const c = new EditorStateCache();
    const s = EditorState.create({ doc: "a" });
    const e = c.epoch("f");
    c.set("f", s, e);
    expect(c.get("f")).toBe(s);
    c.invalidate("f");
    expect(c.has("f")).toBe(false);
    c.set("f", s, e); // editor still holding the old state tries to stash it
    expect(c.has("f")).toBe(false);
    c.set("f", s, c.epoch("f"));
    expect(c.has("f")).toBe(true);
    c.clear();
    expect(c.has("f")).toBe(false);
  });
});
