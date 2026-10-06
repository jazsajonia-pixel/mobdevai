import { PROVIDERS, maskKey } from "../../../src/lib/ai-catalog.js";
import type { ProvidersResponse } from "../../../src/types/ai.js";
import { randomToken } from "../crypto.js";
import { HttpError, json } from "../http.js";
import { requireSession, type SessionData } from "../session.js";
import { assertSameOrigin, rateLimit } from "../security.js";
import { normalizeBaseUrl } from "./url-guard.js";
import type { ProviderState } from "./state.js";
import { openStore, publicPlatform, storageInfo, type ProviderStore } from "./store.js";
import { toPublic } from "./state.js";
import { discoverGeminiModels, geminiModelOptions } from "./gemini-availability.js";

/** Shared plumbing for the /api/ai/providers functions. */

export async function providerContext(req: Request, mutating: boolean) {
  if (mutating) assertSameOrigin(req);
  const session = await requireSession(req);
  await rateLimit(`ai-providers:${session.user.id}`, mutating ? 30 : 120, 60_000);
  const store = openStore(req, session);
  const state = await store.load();
  // Warm the 10-minute model-availability cache so the selector reflects what Google lists.
  await discoverGeminiModels().catch(() => null);
  return { session, store, state };
}

export function respond(store: ProviderStore, state: ProviderState, cookies: string[] = [], status = 200): Response {
  const body: ProvidersResponse = {
    storage: store.mode,
    storageNote: store.note,
    maxProviders: store.max,
    ...toPublic(state, publicPlatform(state.geminiModel)),
    geminiModels: geminiModelOptions(),
  };
  return json(body, { status, cookies });
}

/** For GET when storage isn't configured: still show platform providers (if any). */
export function respondUnavailable(): Response {
  const info = storageInfo();
  const body: ProvidersResponse = { storage: "unavailable", storageNote: info.note, maxProviders: 0, ...toPublic({ v: 1, providers: [], defaultId: null, geminiModel: "gemini-flash-latest" }, publicPlatform()), geminiModels: geminiModelOptions() };
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
