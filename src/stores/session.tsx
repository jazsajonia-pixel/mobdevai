import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@/types/session";
import { safeStorage } from "@/lib/storage";

/**
 * Session state for the client.
 *
 * Phase 0: supports "anonymous" and "demo". Demo state lives in sessionStorage
 * (tab-scoped, nothing sensitive).
 *
 * TODO(phase-1): hydrate the "github" mode from GET /api/auth/session. The GitHub token must
 * live only server-side (encrypted, HTTP-only cookie session) — never in this store.
 */

const DEMO_KEY = "demo-session";

interface SessionContextValue {
  session: Session;
  isAuthed: boolean;
  enterDemo: () => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function readInitialSession(): Session {
  const startedAt = safeStorage.get(DEMO_KEY, "session");
  return startedAt ? { mode: "demo", startedAt } : { mode: "anonymous" };
}

export function SessionProvider({ children, initial }: { children: ReactNode; initial?: Session }) {
  const [session, setSession] = useState<Session>(() => initial ?? readInitialSession());

  const enterDemo = useCallback(() => {
    const startedAt = new Date().toISOString();
    safeStorage.set(DEMO_KEY, startedAt, "session");
    setSession({ mode: "demo", startedAt });
  }, []);

  const signOut = useCallback(() => {
    safeStorage.remove(DEMO_KEY, "session");
    // TODO(phase-1): POST /api/auth/logout to destroy the server session for GitHub mode.
    setSession({ mode: "anonymous" });
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ session, isAuthed: session.mode !== "anonymous", enterDemo, signOut }),
    [session, enterDemo, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
