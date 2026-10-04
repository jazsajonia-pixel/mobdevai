import { describe, expect, it } from "vitest";
import { isActive, isWorkspaceTab, projectPath } from "./nav";

describe("nav helpers", () => {
  it("matches Home only exactly", () => {
    expect(isActive("/app", "/app")).toBe(true);
    expect(isActive("/app", "/app/projects")).toBe(false);
    expect(isActive("/app/projects", "/app/projects/demo/pocket-tasks")).toBe(true);
  });
  it("builds project paths", () => {
    expect(projectPath("demo", "pocket-tasks")).toBe("/app/projects/demo/pocket-tasks");
    expect(projectPath("demo", "pocket-tasks", "git")).toBe("/app/projects/demo/pocket-tasks/git");
  });
  it("validates tabs", () => {
    expect(isWorkspaceTab("preview")).toBe(true);
    expect(isWorkspaceTab("terminal")).toBe(false);
    expect(isWorkspaceTab(undefined)).toBe(false);
  });
});
