import type { AgentMessage, ToolCall } from "../../../src/types/agent";
import type { ToolDef } from "../../../src/lib/agent-tools";
import { HttpError } from "../http";
import { AGENT_TIMEOUT_MS, ANTHROPIC, GEMINI, anthropicHeaders, call, openAiBase, type ResolvedProvider } from "./adapters";

/**
 * One agent step = one model call with tool definitions. The browser runs the loop (executing
 * tools against the local workspace) and calls this again with tool results, so each function
 * invocation stays well inside Netlify's 60 s limit. Messages are normalised here into each
 * provider's native tool-calling format.
 */

export interface StepInput {
  system: string;
  messages: AgentMessage[];
  tools: ToolDef[];
  maxTokens: number;
  signal?: AbortSignal;
}

export interface StepOutput {
  text: string;
  toolCalls: ToolCall[];
  providerState?: unknown;
  model: string;
  stopReason: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

/** Tool output is repository data: fence it so the model can't mistake it for instructions. */
export function wrapToolOutput(name: string, content: string, isError?: boolean): string {
  const safe = content.replace(/<\/?tool_output/gi, (m) => m.replace("<", "&lt;"));
  return `<tool_output tool="${name}"${isError ? ' status="error"' : ""}>\n${safe}\n</tool_output>`;
}

function parseArgs(raw: unknown): { args: Record<string, unknown> | null; rawArgs?: string } {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return { args: raw as Record<string, unknown> };
  if (typeof raw !== "string") return { args: {} };
  if (!raw.trim()) return { args: {} };
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? { args: v as Record<string, unknown> } : { args: null, rawArgs: raw.slice(0, 2000) };
  } catch {
    return { args: null, rawArgs: raw.slice(0, 2000) };
  }
}

/* ── OpenAI + compatible ─────────────────────────────────────────── */

async function openAiStep(p: ResolvedProvider, input: StepInput): Promise<StepOutput> {
  const name = p.kind === "openai" ? "OpenAI" : "The provider";
  const base = await openAiBase(p);
  const messages: unknown[] = [{ role: "system", content: input.system }];
  for (const m of input.messages) {
    if (m.role === "user") messages.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      messages.push({
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args ? JSON.stringify(c.args) : (c.rawArgs ?? "{}") } })) }
          : {}),
      });
    } else messages.push({ role: "tool", tool_call_id: m.toolCallId, content: wrapToolOutput(m.name, m.content, m.isError) });
  }
  const body: Record<string, unknown> = {
    model: p.model,
    messages,
    tools: input.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
  };
  if (p.kind === "openai") body.max_completion_tokens = input.maxTokens * 2; // reasoning tokens count too
  else body.max_tokens = input.maxTokens;
  const data = (await call(name, `${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: input.signal,
    timeoutMs: AGENT_TIMEOUT_MS,
  })) as {
    model?: string;
    choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data?.choices?.[0];
  if (!choice) throw new HttpError(502, "AI_PROVIDER_UNAVAILABLE", `${name} returned no choices.`);
  return {
    text: choice.message?.content ?? "",
    toolCalls: (choice.message?.tool_calls ?? []).map((c, i) => ({ id: c.id ?? `call_${i}`, name: c.function?.name ?? "", ...parseArgs(c.function?.arguments ?? "") })),
    model: data.model ?? p.model,
    stopReason: choice.finish_reason ?? null,
    usage: { inputTokens: data.usage?.prompt_tokens ?? null, outputTokens: data.usage?.completion_tokens ?? null },
  };
}

/* ── Anthropic ───────────────────────────────────────────────────── */

type AnthropicBlock = Record<string, unknown>;

async function anthropicStep(p: ResolvedProvider, input: StepInput): Promise<StepOutput> {
  // Anthropic needs strict user/assistant alternation; tool results travel in user turns.
  const turns: { role: "user" | "assistant"; content: AnthropicBlock[] }[] = [];
  const push = (role: "user" | "assistant", blocks: AnthropicBlock[]) => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else turns.push({ role, content: blocks });
  };
  for (const m of input.messages) {
    if (m.role === "user") push("user", [{ type: "text", text: m.content || "(empty)" }]);
    else if (m.role === "assistant") {
      const blocks: AnthropicBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.args ?? {} });
      push("assistant", blocks.length ? blocks : [{ type: "text", text: "…" }]);
    } else {
      push("user", [{ type: "tool_result", tool_use_id: m.toolCallId, content: wrapToolOutput(m.name, m.content, m.isError), ...(m.isError ? { is_error: true } : {}) }]);
    }
  }
  const data = (await call("Anthropic", `${ANTHROPIC}/v1/messages`, {
    method: "POST",
    headers: anthropicHeaders(p.apiKey),
    body: JSON.stringify({
      model: p.model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: turns,
      tools: input.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
    }),
    signal: input.signal,
    timeoutMs: AGENT_TIMEOUT_MS,
  })) as { model?: string; content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  const content = data?.content ?? [];
  return {
    text: content.filter((c) => c.type === "text").map((c) => c.text ?? "").join(""),
    toolCalls: content.filter((c) => c.type === "tool_use").map((c, i) => ({ id: c.id ?? `toolu_${i}`, name: c.name ?? "", ...parseArgs(c.input) })),
    model: data?.model ?? p.model,
    stopReason: data?.stop_reason ?? null,
    usage: { inputTokens: data?.usage?.input_tokens ?? null, outputTokens: data?.usage?.output_tokens ?? null },
  };
}

/* ── Gemini ──────────────────────────────────────────────────────── */

interface GeminiPart {
  text?: string;
  functionCall?: { id?: string; name?: string; args?: unknown };
  functionResponse?: unknown;
  thoughtSignature?: string;
  thought?: boolean;
}

async function geminiStep(p: ResolvedProvider, input: StepInput): Promise<StepOutput> {
  if (!/^[\w.\-]+$/.test(p.model)) throw new HttpError(400, "AI_MODEL_NOT_FOUND", "Invalid Gemini model name.");
  const contents: { role: "user" | "model"; parts: unknown[] }[] = [];
  const push = (role: "user" | "model", parts: unknown[]) => {
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };
  for (const m of input.messages) {
    if (m.role === "user") push("user", [{ text: m.content || "(empty)" }]);
    else if (m.role === "assistant") {
      // Echo the model's own content verbatim when we have it (Gemini 3 requires thought signatures back).
      const state = m.providerState as { kind?: string; content?: { parts?: unknown[] } } | undefined;
      if (state?.kind === "gemini" && Array.isArray(state.content?.parts)) push("model", state.content.parts);
      else {
        const parts: unknown[] = [];
        if (m.content) parts.push({ text: m.content });
        for (const c of m.toolCalls ?? []) parts.push({ functionCall: { name: c.name, args: c.args ?? {} } });
        push("model", parts.length ? parts : [{ text: "…" }]);
      }
    } else {
      const id = m.toolCallId.startsWith("gem_") ? undefined : m.toolCallId;
      push("user", [{ functionResponse: { ...(id ? { id } : {}), name: m.name, response: m.isError ? { error: wrapToolOutput(m.name, m.content, true) } : { output: wrapToolOutput(m.name, m.content) } } }]);
    }
  }
  const data = (await call("Gemini", `${GEMINI}/models/${encodeURIComponent(p.model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": p.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents,
      tools: [{ functionDeclarations: input.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
      generationConfig: { maxOutputTokens: input.maxTokens * 2 },
    }),
    signal: input.signal,
    timeoutMs: AGENT_TIMEOUT_MS,
  })) as { candidates?: { content?: { role?: string; parts?: GeminiPart[] }; finishReason?: string }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }; modelVersion?: string };
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  if (!cand) throw new HttpError(502, "AI_PROVIDER_UNAVAILABLE", "Gemini returned no candidates (the request may have been blocked).");
  return {
    text: parts.filter((x) => x.text && !x.thought).map((x) => x.text).join(""),
    toolCalls: parts.filter((x) => x.functionCall).map((x, i) => ({ id: x.functionCall?.id ?? `gem_${i}_${Date.now().toString(36)}`, name: x.functionCall?.name ?? "", ...parseArgs(x.functionCall?.args ?? {}) })),
    providerState: { kind: "gemini", content: { role: "model", parts } },
    model: data?.modelVersion ?? p.model,
    stopReason: cand.finishReason ?? null,
    usage: { inputTokens: data?.usageMetadata?.promptTokenCount ?? null, outputTokens: data?.usageMetadata?.candidatesTokenCount ?? null },
  };
}

export function agentStep(p: ResolvedProvider, input: StepInput): Promise<StepOutput> {
  if (p.kind === "anthropic") return anthropicStep(p, input);
  if (p.kind === "gemini") return geminiStep(p, input);
  return openAiStep(p, input);
}
