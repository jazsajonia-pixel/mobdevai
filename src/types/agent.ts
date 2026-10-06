/** Wire + task types for the AI coding agent (Phase 4). Shared by client and server. */

export type AgentMode = "ask" | "agent";

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed JSON arguments. `null` when the model produced unparseable arguments. */
  args: Record<string, unknown> | null;
  /** Raw argument text when parsing failed (so the error can be reported back). */
  rawArgs?: string;
}

export interface AgentAttachment {
  name: string;
  mimeType: string;
  /** Base64 payload without a data URL prefix. */
  data: string;
  size: number;
}
export type AgentMessage =
  | { role: "user"; content: string; attachments?: AgentAttachment[] }
  | {
      role: "assistant";
      content: string;
      toolCalls?: ToolCall[];
      /** Opaque provider data that must be echoed back (e.g. Gemini thought signatures). */
      providerState?: unknown;
    }
  | { role: "tool"; toolCallId: string; name: string; content: string; isError?: boolean };

export interface AgentProjectContext {
  owner: string;
  repo: string;
  branch: string;
  /** "demo" | "github" */
  source: string;
  projectKind?: string;
  fileCount: number;
  /** Path of the file open in the editor, if any. */
  activeFile?: string | null;
}

export interface AgentStepRequest {
  providerId?: string | null;
  mode: AgentMode;
  project: AgentProjectContext;
  messages: AgentMessage[];
}

export interface AgentStepResponse {
  message: Extract<AgentMessage, { role: "assistant" }>;
  stopReason: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null };
  provider: {
    id: string;
    label: string;
    kind: string;
    model: string;
    /** Server Gemini only: the model id the request was sent with (may differ from the user's pick). */
    requestedModel?: string;
    /** Server Gemini only: the user's selection, when it was unavailable and we fell back. */
    fallbackFrom?: string;
    /** Server Gemini only: how many pool keys were tried (1 = no failover). */
    keyAttempts?: number;
  };
}
