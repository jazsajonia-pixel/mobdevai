import { useCallback, useState } from "react";
import { api } from "@/lib/api";

/**
 * Starts GitHub OAuth.
 *
 * Contract (implemented in Phase 1): POST /api/auth/github/start sets a signed, HTTP-only
 * `state` cookie and returns `{ authorizeUrl }`; the browser then navigates to GitHub.
 * GitHub redirects back to /api/auth/github/callback which exchanges the code server-side.
 *
 * In Phase 0 the endpoint answers with GITHUB_OAUTH_NOT_CONFIGURED or NOT_IMPLEMENTED,
 * which the sign-in screen renders as a clear message.
 */
export function useGitHubSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const start = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const { authorizeUrl } = await api<{ authorizeUrl: string }>("/auth/github/start", { method: "POST" });
      const url = new URL(authorizeUrl);
      if (url.origin !== "https://github.com") throw new Error("Unexpected OAuth origin");
      window.location.assign(url.toString());
    } catch (err) {
      setError(err);
      setPending(false);
    }
  }, []);

  return { start, pending, error };
}
