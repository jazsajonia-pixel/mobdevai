import { Link, Redirect, useLocation } from "wouter";
import { ChevronLeft, FlaskConical, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitHubIcon, LogoMark } from "@/components/brand";
import { ErrorState } from "@/components/states";
import { useSession } from "@/stores/session";
import { useGitHubSignIn } from "@/features/auth/github-sign-in";
import { DEMO_PROJECT } from "@/features/demo/sample-project";
import { projectPath } from "@/lib/nav";

export default function SignInPage() {
  const { isAuthed, enterDemo } = useSession();
  const { start, pending, error } = useGitHubSignIn();
  const [, navigate] = useLocation();

  if (isAuthed) return <Redirect to="/app" replace />;

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

        <div className="mt-8 space-y-3">
          <Button size="lg" className="w-full" onClick={start} disabled={pending} data-testid="button-github-signin">
            <GitHubIcon /> {pending ? "Contacting GitHub…" : "Continue with GitHub"}
          </Button>
          {error ? <ErrorState error={error} /> : null}

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
        </div>

        <p className="mt-8 flex gap-2 text-xs leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Your GitHub token stays on the server in an encrypted, HTTP-only session. It is never exposed to browser JavaScript.
        </p>
      </div>
    </div>
  );
}
