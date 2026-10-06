/**
 * Storage that never throws. Some embedded/private browsing contexts block Web Storage;
 * in that case we fall back to memory so the app keeps working for the current tab.
 * Never store secrets here — only non-sensitive UI preferences and drafts.
 */
type Area = "local" | "session";

const memory = new Map<string, string>();

function area(kind: Area): Storage | null {
  try {
    const s = kind === "local" ? window.localStorage : window.sessionStorage;
    const probe = "__mdai_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const PREFIX = "mdai:";

export const safeStorage = {
  get(key: string, kind: Area = "local"): string | null {
    const s = area(kind);
    try {
      return s ? s.getItem(PREFIX + key) : (memory.get(`${kind}:${key}`) ?? null);
    } catch {
      return memory.get(`${kind}:${key}`) ?? null;
    }
  },
  set(key: string, value: string, kind: Area = "local"): void {
    const s = area(kind);
    try {
      if (s) s.setItem(PREFIX + key, value);
      else memory.set(`${kind}:${key}`, value);
    } catch {
      memory.set(`${kind}:${key}`, value);
    }
  },
  /** Like set(), but reports whether the value was persisted (false on quota errors / no storage). */
  trySet(key: string, value: string, kind: Area = "local"): boolean {
    const s = area(kind);
    if (!s) {
      memory.set(`${kind}:${key}`, value);
      return false;
    }
    try {
      s.setItem(PREFIX + key, value);
      return true;
    } catch {
      memory.set(`${kind}:${key}`, value);
      return false;
    }
  },
  remove(key: string, kind: Area = "local"): void {
    const s = area(kind);
    try {
      s?.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
    memory.delete(`${kind}:${key}`);
  },
};
