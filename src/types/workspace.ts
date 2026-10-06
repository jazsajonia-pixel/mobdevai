/**
 * Core workspace domain types shared by the file tree, editor, AI agent, diff and preview.
 */
export type ProjectSource = "github";

export interface ProjectRef {
  id: string;
  source: ProjectSource;
  owner: string;
  name: string;
  defaultBranch: string;
  visibility: "public" | "private";
  description?: string;
}

export interface WorkspaceFile {
  path: string;
  content: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
}

/** Project kinds the browser preview can (eventually) run, in MVP priority order. */
export type ProjectKind = "static-html" | "vite-react" | "vite-ts" | "unknown";

/** Health payload returned by GET /api/health (booleans only — never secret values). */
export interface HealthResponse {
  ok: true;
  service: "chrono";
  phase: number;
  time: string;
  capabilities: {
    githubOAuth: boolean;
    sessions: boolean;
    database: boolean;
    encryption: boolean;
    platformAiProviders: { openai: boolean; anthropic: boolean; gemini: boolean };
  };
}
