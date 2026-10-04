import { PROVIDERS, maskKey } from "../../../src/lib/ai-catalog";
import type { ProvidersResponse } from "../../../src/types/ai";
import { randomToken } from "../crypto";
import { HttpError, json } from "../http";
import { requireSession, type SessionData } from "../session";
import { assertSameOrigin, rateLimit } from "../security";
import { normalizeBaseUrl } from "./url-guard";
import type { ProviderState } from "./state";
import { openStore, publicPlatform, storageInfo, type ProviderStore } from "./store";
import { toPublic } from "./state";

/** Shared plumbing for the /api/ai/providers functions. */

export async function providerContext(req: Request, mutating: boolean) {
  if (mutating) assertSameOrigin(req);
  const session = await requireSession(req);
  await rateLimit(`ai-providers:${session.user.id}`, mutating ? 30 : 120, 60_000);
  const store = openStore(req, session);
  const state = await store.load();
  return { session, store, state };
}

export function respond(store: ProviderStore, state: ProviderState, cookies: string[] = [], status = 200): Response {
  const body: ProvidersResponse = {
    storage: store.mode,
    storageNote: store.note,
    maxProviders: store.max,
    ...toPublic(state, publicPlatform()),
  };
  return json(body, { status, cookies });
}

/** For GET when storage isn't configured: still show platform providers (if any). */
export function respondUnavailable(): Response {
  const info = storageInfo();
  const body: ProvidersResponse = { storage: "unavailable", storageNote: info.note, maxProviders: 0, ...toPublic({ v: 1, providers: [], defaultId: null }, publicPlatform()) };
  return json(body);
}

export function newProviderId(): string {
  return `p_${randomToken(12)}`;
}

/** Base URL is required for compatible providers and ignored (null) for first-party ones. */
export function cleanBaseUrl(kind: keyof typeof PROVIDERS, baseUrl: string | null | undefined): string | null {
  if (!PROVIDERS[kind].needsBaseUrl) return null;
  if (!baseUrl) throw new HttpError(422, "AI_BAD_BASE_URL", "OpenAI-compatible providers need a base URL, e.g. https://api.example.com/v1.");
  return normalizeBaseUrl(baseUrl);
}

export { maskKey };
export type { SessionData };
