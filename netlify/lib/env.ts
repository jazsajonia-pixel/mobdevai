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

export interface GitHubConfig {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  apiUrl: string;
  webUrl: string;
}

/** Returns null when GitHub sign-in isn't fully configured. */
export function githubConfig(env: Env = process.env): GitHubConfig | null {
  const caps = capabilities(env);
  if (!caps.githubOAuth || !caps.sessions) return null;
  return {
    clientId: env.GITHUB_CLIENT_ID!,
    clientSecret: env.GITHUB_CLIENT_SECRET!,
    sessionSecret: env.SESSION_SECRET!,
    // Overridable for GitHub Enterprise or a local mock; defaults to github.com.
    apiUrl: (isSet(env.GITHUB_API_URL) ? env.GITHUB_API_URL : "https://api.github.com").replace(/\/$/, ""),
    webUrl: (isSet(env.GITHUB_WEB_URL) ? env.GITHUB_WEB_URL : "https://github.com").replace(/\/$/, ""),
  };
}

export function sessionSecret(env: Env = process.env): string | null {
  return capabilities(env).sessions ? env.SESSION_SECRET! : null;
}

/** Public base URL of the app (for OAuth redirect_uri). APP_URL wins; otherwise the request origin. */
export function appOrigin(req: Request, env: Env = process.env): string {
  if (isSet(env.APP_URL)) {
    try {
      return new URL(env.APP_URL).origin;
    } catch {
      /* fall through to request origin */
    }
  }
  return new URL(req.url).origin;
}
