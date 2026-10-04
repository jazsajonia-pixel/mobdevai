import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { patchFileName, toPatch } from "./patch";

describe("toPatch", () => {
  const changes = [
    { path: "src/a.ts", status: "modified" as const, base: "one\ntwo\nthree\n", content: "one\n2\nthree\n" },
    { path: "new.md", status: "added" as const, content: "# hi\n" },
    { path: "old.txt", status: "deleted" as const, base: "bye\n" },
  ];

  it("writes git-style headers", () => {
    const p = toPatch(changes);
    expect(p).toContain("diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@");
    expect(p).toContain("new file mode 100644\n--- /dev/null\n+++ b/new.md");
    expect(p).toContain("deleted file mode 100644\n--- a/old.txt\n+++ /dev/null");
    expect(toPatch([])).toBe("");
  });

  it("applies cleanly with git apply", () => {
    const dir = mkdtempSync(join(tmpdir(), "patch-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/a.ts"), "one\ntwo\nthree\n");
    writeFileSync(join(dir, "old.txt"), "bye\n");
    writeFileSync(join(dir, "x.patch"), toPatch(changes));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["apply", "x.patch"], { cwd: dir });
    expect(readFileSync(join(dir, "src/a.ts"), "utf8")).toBe("one\n2\nthree\n");
    expect(readFileSync(join(dir, "new.md"), "utf8")).toBe("# hi\n");
    expect(existsSync(join(dir, "old.txt"))).toBe(false);
  });

  it("names files safely", () => {
    expect(patchFileName("app", "ai/x y", new Date("2026-10-04T12:30:00Z"))).toBe("app-ai_x_y-202610041230.patch");
  });
});
