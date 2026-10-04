import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { clearDemoFlag } from "@/stores/session";

/** Origins we're willing to send the browser to for OAuth (github.com, or a configured GHE/mock). */
export function allowedOAuthOrigins(): string[] {
  const extra = import.meta.env.VITE_GITHUB_WEB_URL as string | undefined;
  return ["https://github.com", ...(extra ? [new URL(extra).origin] : [])];
}

/**
 * Starts GitHub OAuth: POST /api/auth/github/start sets a sealed, HTTP-only `state` cookie and
 * returns the authorize URL; we then navigate there. GitHub redirects back to
 * /api/auth/github/callback, which exchanges the code server-side.
 */
export function useGitHubSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const start = useCallback(async (includePrivate: boolean) => {
    setPending(true);
    setError(null);
    try {
      const { authorizeUrl } = await api<{ authorizeUrl: string }>("/auth/github/start", {
        method: "POST",
        body: { includePrivate },
      });
      const url = new URL(authorizeUrl);
      if (!allowedOAuthOrigins().includes(url.origin)) throw new AppError("OAUTH_EXCHANGE_FAILED", "Unexpected OAuth origin");
      clearDemoFlag(); // the returning tab should hydrate the GitHub session, not the demo
      window.location.assign(url.toString());
    } catch (err) {
      setError(err);
      setPending(false);
    }
  }, []);

  return { start, pending, error };
}

/** Reads and clears `?auth_error=CODE` left by the OAuth callback. */
export function takeAuthError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("auth_error");
  if (code) {
    params.delete("auth_error");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }
  return code;
}
