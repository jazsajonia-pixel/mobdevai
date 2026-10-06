import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import type { AgentMessage, AgentStepResponse } from "@/types/agent";
import { STEP_RETRY, advance, withUserMessage, type StepFn } from "./runner";
import { loadTasks, saveTasks } from "./store";
import { newTask, type AgentTask } from "./task";
import type { WorkspaceView } from "./tools-exec";

const files: Record<string, string> = { "src/a.ts": "export const a = 1;\n" };
const ws: WorkspaceView = { paths: () => Object.keys(files), read: async (p) => files[p]!, changes: () => [] };
const reply = (content: string, toolCalls?: { id: string; name: string; args: Record<string, unknown> }[]): AgentStepResponse => ({
  message: { role: "assistant", content, ...(toolCalls ? { toolCalls } : {}) },
  stopReason: "STOP",
  usage: { inputTokens: 1, outputTokens: 1 },
  provider: { id: "platform:gemini", label: "Google Gemini (server)", kind: "gemini", model: "gemini-flash-latest" },
});
const start = (): AgentTask => withUserMessage(newTask("ask", "Explain"), "Explain a.ts");
const noSleep = async () => {};

afterEach(() => localStorage.clear());

describe("agent step retry after all server keys are cooling", () => {
  it("waits Retry-After and resends the identical step without duplicating messages", async () => {
    const sent: AgentMessage[][] = [];
    const waits: number[] = [];
    let n = 0;
    const step: StepFn = async (_t, messages) => {
      sent.push(messages);
      if (++n < 3) throw new AppError("AI_QUOTA_EXCEEDED", "All keys limited", 429, "r1", 5);
      return reply("done");
    };
    const out = await advance(start(), { step, workspace: ws, signal: new AbortController().signal, onUpdate: () => {}, sleep: async (ms) => void waits.push(ms) });
    expect(out.status).toBe("done");
    expect(waits).toEqual([5000, 5000]);
    expect(sent).toHaveLength(3);
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[2]).toEqual(sent[0]);
    expect(out.messages.filter((m) => m.role === "assistant")).toHaveLength(1);
  });

  it("gives up after the bounded number of retries and keeps the task resumable", async () => {
    let n = 0;
    const step: StepFn = async () => {
      n++;
      throw new AppError("AI_QUOTA_EXCEEDED", "All keys limited", 429, "r1", 3);
    };
    const t0 = start();
    const out = await advance(t0, { step, workspace: ws, signal: new AbortController().signal, onUpdate: () => {}, sleep: noSleep });
    expect(n).toBe(STEP_RETRY.maxRetries + 1);
    expect(out.status).toBe("error");
    expect(out.error?.code).toBe("AI_QUOTA_EXCEEDED");
    expect(out.messages).toEqual(t0.messages);
  });

  it("does not retry request errors or very long waits", async () => {
    for (const err of [new AppError("VALIDATION_FAILED", "bad", 400), new AppError("AI_MODEL_NOT_FOUND", "nf", 400), new AppError("AI_QUOTA_EXCEEDED", "daily", 429, "r", 3600)]) {
      let n = 0;
      const step: StepFn = async () => {
        n++;
        throw err;
      };
      await advance(start(), { step, workspace: ws, signal: new AbortController().signal, onUpdate: () => {}, sleep: noSleep });
      expect(n).toBe(1);
    }
  });
});

describe("pause on project exit and Continue", () => {
  it("leaving the project mid-step stops safely; reload shows it stopped; Continue resumes the same task", async () => {
    const KEY = "ws:demo:demo/pocket-tasks@main";
    const ctrl = new AbortController();
    let latest: AgentTask | null = null;
    let calls = 0;
    // First step returns a tool call; while the second step is in flight the user leaves.
    const step: StepFn = (_t, _m, signal) => {
      calls++;
      if (calls === 1) return Promise.resolve(reply("", [{ id: "c1", name: "read_file", args: { path: "src/a.ts" } }]));
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    };
    const run = advance(start(), { step, workspace: ws, signal: ctrl.signal, onUpdate: (t) => (latest = t) });
    await new Promise((r) => setTimeout(r, 20));
    expect(latest!.status).toBe("running");
    saveTasks(KEY, [latest!]); // what the debounced persist writes
    ctrl.abort(); // unmount on project exit
    const stopped = await run;
    expect(stopped.status).toBe("stopped");
    expect(stopped.error).toBeNull();

    // Coming back: a persisted "running" task is shown as stopped, with its history intact.
    const [restored] = loadTasks(KEY);
    expect(restored!.status).toBe("stopped");
    expect(restored!.messages.some((m) => m.role === "tool" && m.toolCallId === "c1")).toBe(true);

    // Continue: same task, same history, the next step picks up where it left off.
    const seen: AgentMessage[][] = [];
    const resumed = await advance(restored!, { step: async (_t, m) => (seen.push(m), reply("finished")), workspace: ws, signal: new AbortController().signal, onUpdate: () => {} });
    expect(resumed.id).toBe(restored!.id);
    expect(resumed.status).toBe("done");
    expect(seen[0]!.some((m) => m.role === "tool" && m.toolCallId === "c1")).toBe(true);
  });
});
