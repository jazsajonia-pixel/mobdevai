import type { Config } from "@netlify/functions";
import { z } from "zod";
import { MAX_TOOL_ARGS_CHARS, isToolName, toolsForMode } from "../../src/lib/agent-tools.js";
import type { AgentMessage, AgentStepResponse } from "../../src/types/agent.js";
import { HttpError, handle, json } from "../lib/http.js";
import { requireSession } from "../lib/session.js";
import { assertSameOrigin, rateLimit } from "../lib/security.js";
import { readJson } from "../lib/validate.js";
import { agentStep } from "../lib/ai/agent-step.js";
import { systemPrompt } from "../lib/ai/agent-prompt.js";
import { resolveProvider } from "../lib/ai/resolve.js";
import { readSession } from "../lib/session.js";
import { providerIdSchema } from "../lib/ai/schemas.js";
import { CUSTOM_SKILLS } from "../../src/lib/skills.js";

/**
 * POST /api/ai/agent — run ONE agent step.
 * { providerId?, mode: "ask" | "agent", project, messages } → { message, stopReason, usage, provider }
 * The browser executes the returned tool calls against its local workspace and calls again with
 * the results. The system prompt and the tool allow-list are decided here, never by the client.
 */

const MAX_BODY = 900_000;
const MAX_MESSAGES = 160;

const toolCall = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(64),
  args: z.record(z.string(), z.unknown()).nullable(),
  rawArgs: z.string().max(4000).optional(),
});

const message = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().max(200_000), attachments: z.array(z.object({ name: z.string().min(1).max(120), mimeType: z.string().min(1).max(120), data: z.string().max(2_800_000).regex(/^[A-Za-z0-9+/=]*$/), size: z.number().int().min(0).max(2_000_000) })).max(6).optional() }).superRefine((m, ctx) => { if ((m.attachments ?? []).reduce((n, a) => n + a.size, 0) > 5_000_000) ctx.addIssue({ code: "custom", message: "Attachments are too large." }); }),
  z.object({ role: z.literal("assistant"), content: z.string().max(200_000), toolCalls: z.array(toolCall).max(32).optional(), providerState: z.unknown().optional() }),
  z.object({ role: z.literal("tool"), toolCallId: z.string().min(1).max(200), name: z.string().min(1).max(64), content: z.string().max(200_000), isError: z.boolean().optional() }),
]);

const bodySchema = z
  .object({
    providerId: providerIdSchema.nullish(),
    mode: z.enum(["ask", "agent"]),
    project: z.object({
      owner: z.string().max(100),
      repo: z.string().max(100),
      branch: z.string().max(255),
      source: z.enum(["demo", "github"]),
      projectKind: z.string().max(40).optional(),
      fileCount: z.number().int().min(0).max(1_000_000),
      activeFile: z.string().max(1024).nullish(),
    }),
    messages: z.array(message).min(1).max(MAX_MESSAGES),
    skillIds: z.array(z.string().max(60)).max(12).default([]),
  })
  .strict();

/** Every tool result must answer a tool call from the previous assistant turn (providers reject orphans). */
function checkSequence(messages: AgentMessage[]): void {
  if (messages[0]?.role !== "user") throw new HttpError(422, "VALIDATION_FAILED", "Conversation must start with a user message.");
  let open = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant") {
      if (open.size) throw new HttpError(422, "VALIDATION_FAILED", "Every tool call needs a result before the next turn.");
      open = new Set((m.toolCalls ?? []).map((c) => c.id));
      for (const c of m.toolCalls ?? []) {
        if (c.args && JSON.stringify(c.args).length > MAX_TOOL_ARGS_CHARS) throw new HttpError(413, "VALIDATION_FAILED", "A tool call is too large.");
      }
    } else if (m.role === "tool") {
      if (!open.delete(m.toolCallId)) throw new HttpError(422, "VALIDATION_FAILED", "Tool result without a matching call.");
    } else if (open.size) throw new HttpError(422, "VALIDATION_FAILED", "Every tool call needs a result before the next message.");
  }
  if (open.size) throw new HttpError(422, "VALIDATION_FAILED", "Every tool call needs a result.");
  if (messages[messages.length - 1]?.role === "assistant") throw new HttpError(422, "VALIDATION_FAILED", "Nothing to respond to.");
}

export default handle(["POST"], async (req) => {
  assertSameOrigin(req);
  const body = await readJson(req, bodySchema, MAX_BODY);
  const sampleWorkspace = body.project.source === "demo";
  const session = sampleWorkspace ? await readSession(req) : await requireSession(req);
  const rateKey = session ? `ai-agent:${session.user.id}` : `ai-demo:${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"}`;
  await rateLimit(rateKey, sampleWorkspace ? 10 : 40, 60_000);
  const messages = body.messages as AgentMessage[];
  checkSequence(messages);

  const provider = await resolveProvider(req, session, sampleWorkspace ? "platform:gemini" : body.providerId ?? null);
  const knownSkills = new Set(CUSTOM_SKILLS.map((skill) => skill.id));
  if (body.skillIds.some((id) => !knownSkills.has(id))) throw new HttpError(422, "VALIDATION_FAILED", "Unknown skill selected.");
  const tools = toolsForMode(body.mode);
  const out = await agentStep(provider, {
    system: systemPrompt(body.mode, body.project, body.skillIds),
    messages,
    tools,
    maxTokens: 8192,
    signal: req.signal,
  });

  // Drop calls to tools this mode doesn't allow (the client would refuse them anyway).
  const allowed = new Set(tools.map((t) => t.name));
  const toolCalls = out.toolCalls.map((c) => (isToolName(c.name) && allowed.has(c.name) ? c : { ...c, args: null, rawArgs: `Tool "${c.name.slice(0, 64)}" is not available in ${body.mode} mode.` }));

  const res: AgentStepResponse = {
    message: { role: "assistant", content: out.text, ...(toolCalls.length ? { toolCalls } : {}), ...(out.providerState ? { providerState: out.providerState } : {}) },
    stopReason: out.stopReason,
    usage: out.usage,
    provider: { id: provider.id, label: provider.label, kind: provider.kind, model: out.model },
  };
  return json(res);
});

export const config: Config = { path: "/api/ai/agent" };
