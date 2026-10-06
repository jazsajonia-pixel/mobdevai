import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { safeStorage } from "@/lib/storage";
import { BUILTIN_SKILLS, defaultEnabled, newSkillId, type Skill, type SkillsResponse, type SkillsStorage, type UserSkill } from "@/lib/skills";

/**
 * Account-synced skills, shared by every component (composer menu, Skills page, agent requests).
 * The last server copy is cached on this device so the composer works instantly and offline.
 */

const CACHE_KEY = "skills-cache:v2";
const LEGACY_ENABLED_KEY = "chrono:enabled-skills:v1";

export type SkillsStatus = "idle" | "loading" | "ready" | "error";

interface State {
  status: SkillsStatus;
  custom: UserSkill[];
  enabled: string[];
  storage: SkillsStorage | null;
  error: unknown;
  /** True while a save is in flight. */
  saving: boolean;
}

function readCache(): Pick<State, "custom" | "enabled"> {
  try {
    const raw = safeStorage.get(CACHE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { custom?: unknown; enabled?: unknown };
      if (Array.isArray(v.custom) && Array.isArray(v.enabled)) return { custom: v.custom as UserSkill[], enabled: v.enabled.filter((x): x is string => typeof x === "string") };
    }
    // Older builds kept only the enabled built-ins in localStorage.
    const legacy = safeStorage.get(LEGACY_ENABLED_KEY);
    if (legacy) {
      const ids = JSON.parse(legacy) as unknown;
      if (Array.isArray(ids)) return { custom: [], enabled: ids.filter((x): x is string => typeof x === "string") };
    }
  } catch {
    /* fall through */
  }
  return { custom: [], enabled: defaultEnabled() };
}

let state: State = { status: "idle", ...readCache(), storage: null, error: null, saving: false };
const listeners = new Set<() => void>();
function set(next: Partial<State>) {
  state = { ...state, ...next };
  if (next.custom || next.enabled) safeStorage.trySet(CACHE_KEY, JSON.stringify({ custom: state.custom, enabled: state.enabled }));
  listeners.forEach((l) => l());
}

let inflight: Promise<void> | null = null;
export function loadSkills(force = false): Promise<void> {
  if (inflight) return inflight;
  if (state.status === "ready" && !force) return Promise.resolve();
  set({ status: state.status === "ready" ? "ready" : "loading", error: null });
  inflight = api<SkillsResponse>("/skills")
    .then(
      (res) => {
        // First sync: carry over choices made on this device before skills were synced.
        const legacy = safeStorage.get(LEGACY_ENABLED_KEY);
        if (legacy && !res.custom.length) {
          safeStorage.remove(LEGACY_ENABLED_KEY);
          const local = readCache().enabled;
          if (local.join() !== res.enabled.join()) {
            set({ status: "ready", custom: res.custom, enabled: res.enabled, storage: res.storage });
            return save({ custom: res.custom, enabled: local }).catch(() => undefined);
          }
        }
        set({ status: "ready", custom: res.custom, enabled: res.enabled, storage: res.storage });
      },
      (error: unknown) => set({ status: "error", error }),
    )
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

let queue: Promise<unknown> = Promise.resolve();
/** Optimistic replace-all save. Reverts and rethrows on failure. */
function save(next: { custom: UserSkill[]; enabled: string[] }): Promise<void> {
  const before = { custom: state.custom, enabled: state.enabled };
  set({ ...next, saving: true });
  const run = queue.then(() =>
    api<SkillsResponse>("/skills", { method: "PUT", body: { custom: next.custom, enabled: next.enabled } }).then(
      (res) => set({ custom: res.custom, enabled: res.enabled, storage: res.storage, saving: false, status: "ready" }),
      (err: unknown) => {
        set({ ...before, saving: false });
        throw err;
      },
    ),
  );
  queue = run.catch(() => undefined);
  return run;
}

/** Ids to send with an agent request (sync; uses the latest known state). */
export function enabledSkillIds(): string[] {
  return state.enabled;
}

export interface SkillDraft {
  name: string;
  description: string;
  instructions: string;
}

export function useSkills() {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
  useEffect(() => {
    void loadSkills();
  }, []);

  const all: Skill[] = [...BUILTIN_SKILLS, ...snap.custom];

  const toggle = useCallback((id: string) => {
    const on = state.enabled.includes(id);
    return save({ custom: state.custom, enabled: on ? state.enabled.filter((x) => x !== id) : [...state.enabled, id] });
  }, []);

  const create = useCallback((draft: SkillDraft) => {
    const now = new Date().toISOString();
    const skill: UserSkill = { id: newSkillId(), ...draft, createdAt: now, updatedAt: now };
    return save({ custom: [...state.custom, skill], enabled: [...state.enabled, skill.id] }).then(() => skill);
  }, []);

  const update = useCallback((id: string, draft: SkillDraft) => {
    return save({ custom: state.custom.map((s) => (s.id === id ? { ...s, ...draft } : s)), enabled: state.enabled });
  }, []);

  const remove = useCallback((id: string) => {
    return save({ custom: state.custom.filter((s) => s.id !== id), enabled: state.enabled.filter((x) => x !== id) });
  }, []);

  return { ...snap, all, toggle, create, update, remove, reload: () => loadSkills(true) };
}

/** Test helper: reset the module state. */
export function __resetSkillsForTests(): void {
  state = { status: "idle", ...readCache(), storage: null, error: null, saving: false };
  inflight = null;
  queue = Promise.resolve();
}
