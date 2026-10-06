import { MAX_AGENT_STEPS } from "@/lib/agent-tools";
import { AppError } from "@/lib/errors";
import type { AgentAttachment, AgentMessage, AgentStepResponse, ToolCall } from "@/types/agent";
import type { AgentTask } from "./task";
import { compactForWire } from "./task";
import { executeTool, type WorkspaceView } from "./tools-exec";

/**
 * Client-side agent loop: model step → run its tool calls locally → send results → repeat.
 * Pauses on propose_plan (agent mode) until the user approves or asks for changes.
 * Pure orchestration: the step function (server or simulated demo) and workspace are injected.
 */

export type StepFn = (task: AgentTask, messages: AgentMessage[], signal: AbortSignal) => Promise<AgentStepResponse>;

export interface RunDeps {
  step: StepFn;
  workspace: WorkspaceView;
  signal: AbortSignal;
  /** Called after every state change (render + persist). */
  onUpdate: (task: AgentTask) => void;
  /** Injected for tests; defaults to an abortable timer. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/**
 * The server already fails over across every eligible Gemini key inside one request. When it
 * still answers 429/503 (all keys cooling), wait the server's Retry-After and re-send the SAME
 * step a bounded number of times. Steps are stateless on the server and the task is only
 * updated after a successful response, so a retry can't duplicate messages or tool calls.
 */
export const STEP_RETRY = { maxRetries: 2, maxWaitSec: 30, defaultWaitSec: 4 } as const;

const sleepFor = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });

async function stepWithRetry(t: AgentTask, messages: AgentMessage[], deps: RunDeps): Promise<AgentStepResponse> {
  for (let retry = 0; ; retry++) {
    try {
      return await deps.step(t, messages, deps.signal);
    } catch (err) {
      const retryable = err instanceof AppError && (err.code === "AI_QUOTA_EXCEEDED" || (err.code === "AI_PROVIDER_UNAVAILABLE" && [502, 503, 504].includes(err.status ?? 0)));
      if (!retryable || retry >= STEP_RETRY.maxRetries || deps.signal.aborted) throw err;
      const wait = err.retryAfterSec ?? STEP_RETRY.defaultWaitSec;
      if (wait > STEP_RETRY.maxWaitSec) throw err;
      await (deps.sleep ?? sleepFor)(wait * 1000, deps.signal);
      if (deps.signal.aborted) throw err;
    }
  }
}

const touch = (t: AgentTask, patch: Partial<AgentTask>): AgentTask => ({ ...t, ...patch, updatedAt: new Date().toISOString() });

function stepsSinceUser(messages: AgentMessage[]): number {
  let n = 0;
  for (let i = messages.length - 1; i >= 0 && messages[i]!.role !== "user"; i--) if (messages[i]!.role === "assistant") n++;
  return n;
}

/** Close any calls that never got a result so the conversation stays valid for providers. */
export function closeOpenCalls(task: AgentTask, note: string): AgentTask {
  if (!task.pending.length) return task;
  const results: AgentMessage[] = task.pending.map((c) => ({ role: "tool", toolCallId: c.id, name: c.name, content: note, isError: true }));
  return { ...task, messages: [...task.messages, ...results], pending: [] };
}

async function runPending(task: AgentTask, deps: RunDeps): Promise<AgentTask> {
  let t = task;
  while (t.pending.length) {
    if (deps.signal.aborted) return t;
    const call = t.pending[0] as ToolCall;
    if (call.name === "propose_plan" && t.mode === "agent" && call.args) {
      t = touch(t, { status: "awaiting_plan" });
      deps.onUpdate(t);
      return t;
    }
    const r = await executeTool(call, deps.workspace, t.proposal, t.mode);
    t = touch(t, {
      proposal: r.proposal,
      pending: t.pending.slice(1),
      messages: [...t.messages, { role: "tool", toolCallId: call.id, name: call.name, content: r.content, ...(r.isError ? { isError: true } : {}) }],
    });
    deps.onUpdate(t);
  }
  return t;
}

/** Run until the model answers without tools, a plan needs approval, the user stops, or an error. */
export async function advance(task: AgentTask, deps: RunDeps): Promise<AgentTask> {
  let t = touch(task, { status: "running", error: null });
  deps.onUpdate(t);
  try {
    for (;;) {
      t = await runPending(t, deps);
      if (deps.signal.aborted) break;
      if (t.status === "awaiting_plan") return t;
      if (stepsSinceUser(t.messages) >= MAX_AGENT_STEPS) {
        t = touch(t, { status: "step_limit" });
        deps.onUpdate(t);
        return t;
      }
      const res = await stepWithRetry(t, compactForWire(t.messages), deps);
      if (deps.signal.aborted) break;
      const calls = res.message.toolCalls ?? [];
      let message = res.message;
      if (!calls.length && message.role === "assistant") {
        // Tell the user when the model ran out of output budget or said nothing.
        const cut = /^(length|max_tokens|MAX_TOKENS)$/.test(res.stopReason ?? "");
        const note = cut ? "\n\n> The reply hit the model's length limit. Send “continue” to get the rest." : "";
        message = { ...message, content: (message.content || (cut ? "" : "(The model returned an empty reply.)")) + note };
      }
      t = touch(t, {
        messages: [...t.messages, message],
        pending: calls,
        provider: { label: res.provider.label, model: res.provider.fallbackFrom ? `${res.provider.model} (${res.provider.fallbackFrom} unavailable)` : res.provider.model },
        usage: { inputTokens: t.usage.inputTokens + (res.usage.inputTokens ?? 0), outputTokens: t.usage.outputTokens + (res.usage.outputTokens ?? 0) },
      });
      deps.onUpdate(t);
      if (!calls.length) {
        t = touch(t, { status: "done" });
        deps.onUpdate(t);
        return t;
      }
    }
  } catch (err) {
    if (deps.signal.aborted) {
      // fall through to "stopped"
    } else {
      const e = err instanceof AppError ? { code: err.code, message: err.message } : { code: "INTERNAL", message: err instanceof Error ? err.message : "Unknown error" };
      t = touch(closeOpenCalls(t, "Not run: the task failed."), { status: "error", error: e });
      deps.onUpdate(t);
      return t;
    }
  }
  t = touch(closeOpenCalls(t, "Not run: stopped by the user."), { status: "stopped" });
  deps.onUpdate(t);
  return t;
}

/** Add a user message (new turn). Answers a waiting plan with feedback first. */
export function withUserMessage(task: AgentTask, content: string, attachments: AgentAttachment[] = []): AgentTask {
  // Typing while a plan waits = "change the plan like this".
  if (task.status === "awaiting_plan" && task.pending[0]) return answerPlan(task, false, content);
  const t = closeOpenCalls(task, "Not run: the user sent a new message.");
  return touch(t, { messages: [...t.messages, { role: "user", content, ...(attachments.length ? { attachments } : {}) }] });
}

/** Approve the plan (continue) or reject it with feedback (model revises). */
export function answerPlan(task: AgentTask, approved: boolean, feedback?: string): AgentTask {
  const [plan, ...rest] = task.pending;
  if (!plan) return task;
  const content = approved
    ? `The user approved the plan.${feedback ? ` Note from the user: ${feedback}` : ""} Proceed with the changes.`
    : `The user did NOT approve the plan. Their feedback: ${feedback?.trim() || "(none)"}. Revise the plan and call propose_plan again, or ask a question.`;
  const msgs: AgentMessage[] = [...task.messages, { role: "tool", toolCallId: plan.id, name: plan.name, content }];
  // Calls queued after a rejected plan are skipped.
  const skipped: AgentMessage[] = approved ? [] : rest.map((c) => ({ role: "tool", toolCallId: c.id, name: c.name, content: "Skipped: the plan was not approved.", isError: true }));
  return touch(task, { messages: [...msgs, ...skipped], pending: approved ? rest : [], status: "idle" });
}
