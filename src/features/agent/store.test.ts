import { afterEach, describe, expect, it } from "vitest";
import { loadTasks, markTasksShipped, saveTasks, tasksForPaths } from "./store";
import { newTask, type AgentTask } from "./task";

const KEY = "ws:demo:demo/pocket-tasks@main";
const withFile = (t: AgentTask, path: string, decision: "accepted" | "rejected"): AgentTask => ({
  ...t,
  proposal: { [path]: { path, before: "a", after: "b", decision } },
});

afterEach(() => localStorage.clear());

describe("shipping info on tasks", () => {
  it("finds tasks whose accepted files were committed and records the commit", () => {
    const a = withFile(newTask("agent", "Change app"), "src/App.jsx", "accepted");
    const b = withFile(newTask("agent", "Change css"), "src/styles.css", "rejected");
    saveTasks(KEY, [a, b]);
    const hits = tasksForPaths(KEY, ["src/App.jsx", "src/styles.css"]);
    expect(hits.map((t) => t.id)).toEqual([a.id]);

    markTasksShipped(KEY, [a.id], { sha: "abc1234", url: "https://x/commit/abc", branch: "ai/x", at: new Date().toISOString(), pr: { number: 3, url: "https://x/pull/3" } });
    expect(loadTasks(KEY).find((t) => t.id === a.id)?.shipped?.pr?.number).toBe(3);
    // Already-shipped tasks aren't matched again.
    expect(tasksForPaths(KEY, ["src/App.jsx"])).toEqual([]);
  });

  it("a later save from a stale in-memory copy keeps the shipping info", () => {
    const a = withFile(newTask("agent", "Change app"), "src/App.jsx", "accepted");
    saveTasks(KEY, [a]);
    markTasksShipped(KEY, [a.id], { sha: "abc1234", url: null, branch: "main", at: new Date().toISOString(), simulated: true });
    saveTasks(KEY, [{ ...a, title: "Renamed" }]);
    const t = loadTasks(KEY)[0];
    expect(t?.title).toBe("Renamed");
    expect(t?.shipped?.simulated).toBe(true);
  });
});
