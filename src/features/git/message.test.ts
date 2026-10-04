import { describe, expect, it } from "vitest";
import { branchNameError, generateCommitMessage, slugify, subjectFromChanges, suggestBranchName } from "./message";
import type { FileChange } from "@/features/workspace/model";

const mod = (path: string, base = "a\n", content = "b\n"): FileChange => ({ path, status: "modified", base, content });

describe("commit message", () => {
  it("summarises the actual changes", () => {
    expect(subjectFromChanges([mod("src/App.jsx")])).toBe("Update src/App.jsx");
    expect(subjectFromChanges([{ path: "a.md", status: "added", content: "x" }, { path: "b.md", status: "added", content: "y" }])).toBe("Add a.md and b.md");
    expect(subjectFromChanges([mod("src/a.ts"), mod("src/b.ts"), mod("src/c.ts"), mod("src/d.ts")])).toBe("Update 4 files in src");
    expect(subjectFromChanges([mod("x/a.ts"), { path: "y/b.ts", status: "deleted", base: "q" }])).toBe("Update a.ts and b.ts");
  });

  it("uses a single AI task's request as the subject and lists files with line counts", () => {
    const msg = generateCommitMessage([mod("src/App.jsx", "a\n", "a\nb\nc\n"), { path: "old.css", status: "deleted", base: "x" }], { taskTitles: ["add a delete button to each task."] });
    const [subject, , ...rest] = msg.split("\n");
    expect(subject).toBe("Add a delete button to each task");
    expect(rest.join("\n")).toContain("- Update src/App.jsx (+2 −0)");
    expect(rest.join("\n")).toContain("- Delete old.css");
    expect(msg).toContain("AI task: “Add a delete button to each task”");
  });
});

describe("branch names", () => {
  it("builds ai/mobile-development-ai/<slug> and avoids taken names", () => {
    expect(suggestBranchName("Add a “Clear completed” button!")).toBe("ai/mobile-development-ai/add-a-clear-completed-button");
    expect(suggestBranchName("Support dark mode", ["ai/mobile-development-ai/support-dark-mode"])).toBe("ai/mobile-development-ai/support-dark-mode-2");
    expect(slugify("Ünïcode — and a very long request that keeps on going and going")).toBe("unicode-and-a-very-long-request");
    expect(slugify("Add a getting started section to the README", 40)).toBe("add-a-getting-started-section");
    expect(slugify("!!!")).toBe("changes");
  });
  it("validates like the server", () => {
    expect(branchNameError("ai/x")).toBeNull();
    for (const bad of ["", "a b", "a..b", "a/", "x.lock", "a~b"]) expect(branchNameError(bad)).not.toBeNull();
  });
});
