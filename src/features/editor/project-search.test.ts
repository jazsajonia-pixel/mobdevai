import { describe, expect, it } from "vitest";
import { buildMatcher, searchContent } from "./project-search";

describe("project search", () => {
  it("escapes plain text and honours case", () => {
    const re = buildMatcher("a.b", { caseSensitive: false, regexp: false })!;
    expect(searchContent("f", "x\nA.B here\naxb", re)?.matches).toEqual([{ line: 2, text: "A.B here", start: 0, end: 3 }]);
    expect(searchContent("f", "A.B", buildMatcher("a.b", { caseSensitive: true, regexp: false })!)).toBeNull();
  });
  it("supports regex and rejects invalid ones", () => {
    expect(searchContent("f", "foo1 foo22", buildMatcher("foo\\d+", { caseSensitive: true, regexp: true })!)?.matches[0]).toMatchObject({ start: 0, end: 4 });
    expect(buildMatcher("(", { caseSensitive: false, regexp: true })).toBeNull();
  });
  it("trims long lines around the match", () => {
    const line = "x".repeat(500) + "needle";
    const m = searchContent("f", line, buildMatcher("needle", { caseSensitive: false, regexp: false })!)!.matches[0]!;
    expect(m.text.slice(m.start, m.end)).toBe("needle");
    expect(m.text.length).toBeLessThanOrEqual(240);
  });
});
