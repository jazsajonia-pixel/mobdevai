/**
 * Server-side configuration. Reads process.env inside functions only.
 * Exposes *booleans* about what is configured — never the values themselves.
 */

type Env = Record<string, string | undefined>;

const PLACEHOLDER = /^(your-|replace-|changeme|xxx)/i;

/** A value counts as configured only if it's present and not a .env.example placeholder. */
export function isSet(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0 && !PLACEHOLDER.test(value.trim());
}

export interface Capabilities {
  githubOAuth: boolean;
  sessions: boolean;
  database: boolean;
  encryption: boolean;
  platformAiProviders: { openai: boolean; anthropic: boolean; gemini: boolean };
}

export function capabilities(env: Env = process.env): Capabilities {
  return {
    githubOAuth: isSet(env.GITHUB_CLIENT_ID) && isSet(env.GITHUB_CLIENT_SECRET),
    sessions: isSet(env.SESSION_SECRET) && (env.SESSION_SECRET?.length ?? 0) >= 32,
    database: isSet(env.DATABASE_URL),
    encryption: isSet(env.ENCRYPTION_KEY),
    platformAiProviders: {
      openai: isSet(env.OPENAI_API_KEY),
      anthropic: isSet(env.ANTHROPIC_API_KEY),
      gemini: isSet(env.GEMINI_API_KEY),
    },
  };
}
