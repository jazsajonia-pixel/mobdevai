import { describe, expect, it } from "vitest";
import { diffChange, diffText, splitRows } from "./diff";

describe("diff", () => {
  it("counts added and removed lines with line numbers", () => {
    const { hunks, added, removed } = diffText("a\nb\nc\n", "a\nB\nc\nd\n");
    expect(added).toBe(2);
    expect(removed).toBe(1);
    const kinds = hunks[0]!.lines.map((l) => `${l.kind}:${l.text}`);
    expect(kinds).toEqual(["context:a", "del:b", "add:B", "context:c", "add:d"]);
    expect(hunks[0]!.lines.find((l) => l.text === "d")?.newNo).toBe(4);
  });
  it("diffs added and deleted files against empty", () => {
    expect(diffChange({ path: "n", status: "added", content: "x\ny\n" }).added).toBe(2);
    expect(diffChange({ path: "d", status: "deleted", base: "x\n" }).removed).toBe(1);
  });
  it("pairs deletions with additions for side-by-side", () => {
    const { hunks } = diffText("a\nb\nc\n", "a\nB\nC\nc\n");
    const rows = splitRows(hunks[0]!);
    expect(rows.map((r) => [r.left?.text ?? null, r.right?.text ?? null])).toEqual([["a", "a"], ["b", "B"], [null, "C"], ["c", "c"]]);
  });
  it("skips very large diffs", () => {
    const big = "x\n".repeat(250_000);
    expect(diffChange({ path: "big", status: "modified", base: big, content: big + "y\n" }).tooLarge).toBe(true);
  });
});
