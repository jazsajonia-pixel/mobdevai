import { useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { ChevronLeft, FlaskConical, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitHubIcon, LogoMark } from "@/components/brand";
import { ErrorState } from "@/components/states";
import { useSession } from "@/stores/session";
import { takeAuthError, useGitHubSignIn } from "@/features/auth/github-sign-in";
import { DEMO_PROJECT } from "@/features/demo/sample-project";
import { projectPath } from "@/lib/nav";
import { AppError, isErrorCode } from "@/lib/errors";

export default function SignInPage() {
  const { isAuthed, loading, enterDemo, endedReason, session } = useSession();
  const { start, pending, error } = useGitHubSignIn();
  const [, navigate] = useLocation();
  const [includePrivate, setIncludePrivate] = useState(false);
  // Errors reported by the OAuth callback (?auth_error=CODE) or a server-ended session.
  const [callbackError] = useState(() => {
    const code = takeAuthError();
    return code ? new AppError(isErrorCode(code) ? code : "INTERNAL") : null;
  });

  if (!loading && isAuthed && session.mode === "github") return <Redirect to="/app/projects" replace />;

  const shownError = error ?? callbackError ?? (endedReason ? new AppError(endedReason) : null);

  return (
    <div className="flex min-h-dvh flex-col px-4 pb-safe pt-safe">
      <div className="flex h-14 items-center">
        <Link href="/" aria-label="Back" className="-ml-2 grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-surface-2">
          <ChevronLeft className="size-5" />
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center pb-16">
        <LogoMark className="size-10" />
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Sign in to Mobile Development AI</h1>
        <p className="mt-2 text-sm text-muted-foreground">Connect GitHub to open your repositories. We never ask for your GitHub password.</p>

        {session.mode === "demo" ? (
          <p className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            You're in demo mode. Signing in with GitHub replaces the demo session.
          </p>
        ) : null}

        <div className="mt-8 space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-3">
            <input
              type="checkbox"
              checked={includePrivate}
              onChange={(e) => setIncludePrivate(e.target.checked)}
              data-testid="checkbox-include-private"
              className="mt-0.5 size-5 shrink-0 accent-[hsl(var(--primary))]"
            />
            <span className="text-sm">
              <span className="font-medium">Include private repositories</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Requests GitHub's <code className="font-mono">repo</code> scope. Leave off to grant public repositories only (
                <code className="font-mono">public_repo</code>).
              </span>
            </span>
          </label>

          <Button size="lg" className="w-full" onClick={() => void start(includePrivate)} disabled={pending} data-testid="button-github-signin">
            <GitHubIcon /> {pending ? "Redirecting to GitHub…" : "Continue with GitHub"}
          </Button>
          {shownError ? <ErrorState error={shownError} /> : null}

          {session.mode !== "demo" ? (
            <>
              <div className="flex items-center gap-3 py-2 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
              <Button
                size="lg"
                variant="secondary"
                className="w-full"
                data-testid="button-signin-demo"
                onClick={() => {
                  enterDemo();
                  navigate(projectPath(DEMO_PROJECT.owner, DEMO_PROJECT.name));
                }}
              >
                <FlaskConical /> Explore the demo
              </Button>
            </>
          ) : (
            <Button asChild size="lg" variant="ghost" className="w-full">
              <Link href="/app">Back to demo</Link>
            </Button>
          )}
        </div>

        <p className="mt-8 flex gap-2 text-xs leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Your GitHub token stays on the server in an encrypted, HTTP-only cookie. It is never exposed to browser JavaScript, and it's revoked when you sign out.
        </p>
      </div>
    </div>
  );
}
