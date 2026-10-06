import type { SessionData } from "../session.js";
import { HttpError } from "../http.js";
import type { ResolvedProvider } from "./adapters.js";
import { effectiveDefault, findProvider } from "./state.js";
import { openStore, platformProviders } from "./store.js";

/**
 * Resolve a provider id (or the user's default) to model + decrypted key — server-side only.
 * Phase 4's chat/agent functions call this; the key never leaves the function.
 */
export async function resolveProvider(req: Request, session: SessionData | null, id?: string | null): Promise<ResolvedProvider & { id: string; label: string }> {
  const platform = platformProviders();
  const requested = id ?? null;
  const directPlatform = requested ? platform.find((p) => p.id === requested) : null;
  if (directPlatform) return { id: directPlatform.id, label: directPlatform.label, kind: directPlatform.kind, model: directPlatform.model, effort: "medium", baseUrl: null, apiKey: directPlatform.apiKey };
  if (!session) throw new HttpError(401, "UNAUTHENTICATED", "Sign in with GitHub first.");
  let state = null;
  try {
    state = await openStore(req, session).load();
  } catch (err) {
    if (!(err instanceof HttpError && err.code === "AI_NOT_CONFIGURED") || platform.length === 0) throw err;
  }
  const store = state ? openStore(req, session) : null;
  const pubPlatform = platform.map(({ apiKey: _k, ...p }) => p);
  const target = requested ?? (state ? effectiveDefault(state, pubPlatform) : (platform[0]?.id ?? null));
  if (!target) throw new HttpError(409, "AI_NO_PROVIDER", "Add an AI provider in Settings first.");

  const plat = platform.find((p) => p.id === target);
  if (plat) return { id: plat.id, label: plat.label, kind: plat.kind, model: plat.model, effort: "medium", baseUrl: null, apiKey: plat.apiKey };

  if (!state || !store) throw new HttpError(409, "AI_NO_PROVIDER", "Add an AI provider in Settings first.");
  const rec = findProvider(state, target);
  if (!rec.enabled) throw new HttpError(409, "AI_NO_PROVIDER", `${rec.label} is disabled. Enable it in Settings.`);
  return { id: rec.id, label: rec.label, kind: rec.kind, model: rec.model, effort: rec.effort, baseUrl: rec.baseUrl, apiKey: await store.decryptKey(rec) };
}
