import { Link } from "wouter";
import { ArrowRight, FlaskConical, FolderGit2, GitBranch } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { GitHubIcon } from "@/components/brand";
import { useSession } from "@/stores/session";
import { DEMO_FILES, DEMO_PROJECT } from "@/features/demo/sample-project";
import { PHASES } from "@/features/demo/roadmap";
import { projectPath } from "@/lib/nav";
import { PROJECT_KIND_LABEL, detectProjectKind } from "@/lib/tree";
import { cn, timeAgo } from "@/lib/utils";

export default function HomePage() {
  const { session } = useSession();
  const kind = detectProjectKind(DEMO_FILES);

  return (
    <AppShell title="Home">
      <section className="rounded-lg border bg-surface p-4">
        {session.mode === "demo" ? (
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-warning/15 text-warning">
              <FlaskConical className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Demo workspace</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Started {timeAgo(new Date(session.startedAt))}. Everything stays in this browser tab.
              </p>
            </div>
          </div>
        ) : session.mode === "github" ? (
          <div className="flex items-center gap-3">
            <img src={session.user.avatarUrl} alt="" className="size-10 rounded-full" />
            <p className="text-sm font-semibold">{session.user.name ?? session.user.login}</p>
          </div>
        ) : null}
      </section>

      <h2 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">Continue</h2>
      <Link
        href={projectPath(DEMO_PROJECT.owner, DEMO_PROJECT.name)}
        data-testid="card-continue-demo"
        className="group flex items-center gap-3 rounded-lg border bg-surface p-4 transition-colors hover:bg-surface-2"
      >
        <FolderGit2 className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {DEMO_PROJECT.owner}/{DEMO_PROJECT.name}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-mono">
              <GitBranch className="size-3" aria-hidden /> {DEMO_PROJECT.defaultBranch}
            </span>
            <span aria-hidden>·</span>
            <span>{PROJECT_KIND_LABEL[kind]}</span>
            <span aria-hidden>·</span>
            <span className="tabular">{DEMO_FILES.length} files</span>
          </p>
        </div>
        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>

      <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed p-4">
        <GitHubIcon className="size-5 shrink-0 text-muted-foreground" />
        <p className="flex-1 text-sm text-muted-foreground">Your GitHub repositories will appear here once GitHub sign-in is enabled.</p>
        <Badge tone="warning">Phase 1</Badge>
      </div>

      <h2 className="mb-2 mt-8 text-xs font-medium uppercase tracking-wide text-muted-foreground">Build status</h2>
      <ol className="overflow-hidden rounded-lg border" data-testid="list-roadmap">
        {PHASES.map((p) => (
          <li key={p.n} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px]",
                p.status === "done" ? "bg-primary text-primary-foreground" : p.status === "next" ? "border border-primary text-primary" : "border text-muted-foreground",
              )}
            >
              {p.n}
            </span>
            <span className={cn("flex-1 text-sm", p.status === "planned" && "text-muted-foreground")}>{p.title}</span>
            {p.status === "done" ? <Badge tone="primary">Done</Badge> : p.status === "next" ? <Badge tone="warning">Next</Badge> : null}
          </li>
        ))}
      </ol>
    </AppShell>
  );
}
