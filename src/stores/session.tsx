import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@/types/session";
import type { AuthSessionResponse } from "@/types/github";
import { safeStorage } from "@/lib/storage";
import { api, SESSION_EXPIRED_EVENT } from "@/lib/api";
import type { ErrorCode } from "@/lib/errors";

/**
 * Client session state.
 *  - demo: tab-scoped flag in sessionStorage (nothing sensitive)
 *  - github: hydrated from GET /api/auth/session. The GitHub token never enters this store —
 *    it stays in an encrypted HTTP-only cookie that only Netlify Functions can read.
 */

const DEMO_KEY = "demo-session";

interface SessionContextValue {
  session: Session;
  /** True while the initial /api/auth/session check is in flight. */
  loading: boolean;
  isAuthed: boolean;
  /** Set when the server ended the session (expired/revoked) so sign-in can explain why. */
  endedReason: ErrorCode | null;
  enterDemo: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Called right before leaving for GitHub OAuth so the returning tab hydrates the GitHub session. */
export function clearDemoFlag(): void {
  safeStorage.remove(DEMO_KEY, "session");
}

function demoSession(): Session | null {
  const startedAt = safeStorage.get(DEMO_KEY, "session");
  return startedAt ? { mode: "demo", startedAt } : null;
}

async function fetchGitHubSession(): Promise<Session> {
  try {
    const res = await api<AuthSessionResponse>("/auth/session", { timeoutMs: 8_000 });
    if (res.authenticated) {
      return { mode: "github", user: res.user, scopes: res.scopes, includePrivate: res.includePrivate, expiresAt: res.expiresAt };
    }
  } catch {
    // Backend unreachable → behave as signed out; the sign-in screen surfaces the real error.
  }
  return { mode: "anonymous" };
}

export function SessionProvider({ children, initial }: { children: ReactNode; initial?: Session }) {
  const [session, setSession] = useState<Session>(() => initial ?? demoSession() ?? { mode: "anonymous" });
  const [loading, setLoading] = useState(() => !initial && !demoSession());
  const [endedReason, setEndedReason] = useState<ErrorCode | null>(null);

  const refresh = useCallback(async () => {
    const next = await fetchGitHubSession();
    setSession((cur) => (cur.mode === "demo" && next.mode === "anonymous" ? cur : next));
  }, []);

  useEffect(() => {
    if (!loading) return;
    let alive = true;
    fetchGitHubSession().then((s) => {
      if (!alive) return;
      setSession((cur) => (cur.mode === "demo" ? cur : s));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [loading]);

  useEffect(() => {
    const onExpired = (e: Event) => {
      const code = (e as CustomEvent<ErrorCode>).detail;
      setSession((cur) => (cur.mode === "github" ? { mode: "anonymous" } : cur));
      setEndedReason(code === "UNAUTHENTICATED" ? "SESSION_EXPIRED" : code);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const enterDemo = useCallback(() => {
    const startedAt = new Date().toISOString();
    safeStorage.set(DEMO_KEY, startedAt, "session");
    setEndedReason(null);
    setSession({ mode: "demo", startedAt });
  }, []);

  const signOut = useCallback(async () => {
    safeStorage.remove(DEMO_KEY, "session");
    if (session.mode === "github") {
      try {
        await api("/auth/logout", { method: "POST" });
      } catch {
        // Even if the request fails, drop local state; the cookie expires on its own.
      }
    }
    setEndedReason(null);
    setSession({ mode: "anonymous" });
  }, [session.mode]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, loading, isAuthed: session.mode !== "anonymous", endedReason, enterDemo, signOut, refresh }),
    [session, loading, endedReason, enterDemo, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
