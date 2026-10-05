import type { ProviderEffort, ProviderKind, ProviderTestResult, PublicProvider} from "../../../src/types/ai";
import { HttpError } from "../http";

/** Pure state operations shared by the cookie and database backends. */

export interface StoredProvider {
  id: string;
  kind: ProviderKind;
  label: string;
  model: string;
  effort: ProviderEffort;
  baseUrl: string | null;
  enabled: boolean;
  /** encryptField() output. Never leaves the server. */
  keyCipher: string;
  keyHint: string;
  lastTest: ProviderTestResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderState {
  v: 1;
  providers: StoredProvider[];
  defaultId: string | null;
}

export const emptyState = (): ProviderState => ({ v: 1, providers: [], defaultId: null });

export interface PlatformProvider {
  id: string;
  kind: ProviderKind;
  label: string;
  model: string;
  effort: ProviderEffort;
}

export function addProvider(state: ProviderState, rec: StoredProvider, makeDefault: boolean, max: number): ProviderState {
  if (state.providers.length >= max) throw new HttpError(409, "AI_STORAGE_FULL", `You can save up to ${max} providers here.`);
  const providers = [...state.providers, rec];
  const defaultId = makeDefault || (!state.defaultId && rec.enabled) ? rec.id : state.defaultId;
  return { ...state, providers, defaultId };
}

export function findProvider(state: ProviderState, id: string): StoredProvider {
  const p = state.providers.find((x) => x.id === id);
  if (!p) throw new HttpError(404, "NOT_FOUND", "That provider doesn't exist (it may have been removed).");
  return p;
}

export function updateProvider(state: ProviderState, id: string, patch: Partial<Omit<StoredProvider, "id" | "createdAt">>): ProviderState {
  findProvider(state, id);
  const now = new Date().toISOString();
  const providers = state.providers.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now } : p));
  let next = { ...state, providers };
  // Disabling the default moves "default" to the next enabled provider.
  if (patch.enabled === false && state.defaultId === id) next = { ...next, defaultId: firstEnabled(next, id) };
  return next;
}

function firstEnabled(state: ProviderState, except?: string): string | null {
  return state.providers.find((p) => p.enabled && p.id !== except)?.id ?? null;
}

export function removeProvider(state: ProviderState, id: string): ProviderState {
  findProvider(state, id);
  const next = { ...state, providers: state.providers.filter((p) => p.id !== id) };
  return state.defaultId === id ? { ...next, defaultId: firstEnabled(next) } : next;
}

export function setDefault(state: ProviderState, id: string, platform: PlatformProvider[]): ProviderState {
  if (platform.some((p) => p.id === id)) return { ...state, defaultId: id };
  const p = findProvider(state, id);
  if (!p.enabled) throw new HttpError(409, "VALIDATION_FAILED", "Enable the provider before making it the default.");
  return { ...state, defaultId: id };
}

export function recordTest(state: ProviderState, id: string, result: ProviderTestResult): ProviderState {
  if (!state.providers.some((p) => p.id === id)) return state;
  return { ...state, providers: state.providers.map((p) => (p.id === id ? { ...p, lastTest: result } : p)) };
}

/** The provider the agent uses when none is picked: explicit default → first enabled → first platform. */
export function effectiveDefault(state: ProviderState, platform: PlatformProvider[]): string | null {
  const ids = new Set([...state.providers.filter((p) => p.enabled).map((p) => p.id), ...platform.map((p) => p.id)]);
  if (state.defaultId && ids.has(state.defaultId)) return state.defaultId;
  return firstEnabled(state) ?? platform[0]?.id ?? null;
}

export function toPublic(state: ProviderState, platform: PlatformProvider[]): { providers: PublicProvider[]; defaultId: string | null } {
  const defaultId = effectiveDefault(state, platform);
  const user: PublicProvider[] = state.providers.map((p) => ({
    id: p.id,
    kind: p.kind,
    label: p.label,
    model: p.model,
    effort: p.effort,
    baseUrl: p.baseUrl,
    enabled: p.enabled,
    isDefault: p.id === defaultId,
    keyHint: p.keyHint,
    source: "user",
    lastTest: p.lastTest,
    updatedAt: p.updatedAt,
  }));
  const plat: PublicProvider[] = platform.map((p) => ({
    id: p.id,
    kind: p.kind,
    label: p.label,
    model: p.model,
    effort: p.effort,
    baseUrl: null,
    enabled: true,
    isDefault: p.id === defaultId,
    keyHint: "Server key",
    source: "platform",
    lastTest: null,
    updatedAt: new Date(0).toISOString(),
  }));
  return { providers: [...user, ...plat], defaultId };
}
