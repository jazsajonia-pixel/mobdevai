import type { AgentMessage, AgentMode, ToolCall } from "@/types/agent";
import type { Proposal } from "./proposal";
import type { AgentActivity } from "./activity";

export type TaskStatus = "idle" | "running" | "awaiting_plan" | "done" | "stopped" | "error" | "step_limit";

/** Frozen progress for a completed user request inside a multi-turn task. */
export interface AgentActivityRun {
  id: string;
  startMessageIndex: number;
  afterMessageIndex: number;
  activities: AgentActivity[];
  status: TaskStatus;
  updatedAt: string;
  changedFiles: number;
}

export interface AgentTask {
  id: string;
  title: string;
  mode: AgentMode;
  createdAt: string;
  updatedAt: string;
  status: TaskStatus;
  messages: AgentMessage[];
  /** Friendly progress events shown in the live activity card. */
  activities: AgentActivity[];
  /** Historical per-request progress cards; optional for tasks saved by older app versions. */
  activityHistory?: AgentActivityRun[];
  /** Message index where the current request began; optional for older saved tasks. */
  activityStartMessageIndex?: number;
  /** Tool calls from the last assistant turn still waiting to run (after a plan pause). */
  pending: ToolCall[];
  proposal: Proposal;
  error: { code: string; message: string } | null;
  provider: { label: string; model: string } | null;
  usage: { inputTokens: number; outputTokens: number };
  /** Set when accepted changes from this task were committed (Phase 6). */
  shipped?: ShippedInfo;
}

export interface ShippedInfo {
  sha: string;
  url: string | null;
  branch: string;
  at: string;
  pr?: { number: number; url: string } | null;
}

export function newTask(mode: AgentMode, title: string): AgentTask {
  const now = new Date().toISOString();
  return {
    id: `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: title.slice(0, 80) || "New task",
    mode,
    createdAt: now,
    updatedAt: now,
    status: "idle",
    messages: [],
    activities: [],
    activityHistory: [],
    activityStartMessageIndex: 0,
    pending: [],
    proposal: {},
    error: null,
    provider: null,
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

/** The plan call awaiting approval, if any. */
export function awaitingPlan(task: AgentTask): ToolCall | null {
  return task.status === "awaiting_plan" ? (task.pending[0] ?? null) : null;
}

/** Result message for each tool call id (for rendering the log). */
export function resultsById(messages: AgentMessage[]): Map<string, Extract<AgentMessage, { role: "tool" }>> {
  const m = new Map<string, Extract<AgentMessage, { role: "tool" }>>();
  for (const msg of messages) if (msg.role === "tool") m.set(msg.toolCallId, msg);
  return m;
}

/**
 * Keep the request within budget: replace the oldest tool outputs with a stub (the model can
 * re-read files). The latest turn is never trimmed.
 */
export function compactForWire(messages: AgentMessage[], budget = 350_000): AgentMessage[] {
  let total = messages.reduce((n, m) => n + m.content.length + (m.role === "assistant" ? JSON.stringify(m.toolCalls ?? []).length : 0), 0);
  if (total <= budget) return messages;
  const out = [...messages];
  const lastUser = out.map((m) => m.role).lastIndexOf("user");
  for (let i = 0; i < lastUser && total > budget; i++) {
    const m = out[i]!;
    if (m.role === "tool" && m.content.length > 400) {
      total -= m.content.length - 80;
      out[i] = { ...m, content: "[earlier output removed to save context — call the tool again if you need it]" };
    }
  }
  return out;
}

/** Version for localStorage: long tool outputs are trimmed (the agent can re-read). */
export function compactForStorage(task: AgentTask): AgentTask {
  return {
    ...task,
    messages: task.messages.map((m) => (m.role === "tool" && m.content.length > 6000 ? { ...m, content: `${m.content.slice(0, 6000)}\n[… trimmed when saved]` } : m)),
  };
}

/** Strip the attached-files block from a user message for display. */
export function splitUserMessage(content: string): { text: string; files: string[] } {
  const i = content.indexOf("\n\nAttached files (repository content");
  const files = [...content.matchAll(/<attached_file path="([^"]+)">/g)].map((m) => m[1]!);
  return { text: i >= 0 ? content.slice(0, i) : content, files };
}
