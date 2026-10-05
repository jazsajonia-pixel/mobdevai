import { Link } from "wouter";
import { ArrowRight, FlaskConical, FolderGit2, GitBranch } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useSession } from "@/stores/session";
import { DEMO_FILES, DEMO_PROJECT } from "@/features/demo/sample-project";
import { recentRepos } from "@/features/github/recent";
import { projectPath } from "@/lib/nav";
import { PROJECT_KIND_LABEL, detectProjectKind } from "@/lib/tree";
import { timeAgo } from "@/lib/utils";

function ProjectCard({ href, title, meta, testId }: { href: string; title: string; meta: React.ReactNode; testId: string }) {
  return (
    <Link href={href} data-testid={testId} className="group flex items-center gap-3 rounded-lg border bg-surface p-4 transition-colors hover:bg-surface-2">
      <FolderGit2 className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">{meta}</p>
      </div>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

export default function HomePage() {
  const { session } = useSession();
  const kind = detectProjectKind(DEMO_FILES);
  const recent = session.mode === "github" ? recentRepos() : [];

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
              <p className="mt-0.5 text-sm text-muted-foreground">Started {timeAgo(new Date(session.startedAt))}. Everything stays in this browser tab.</p>
            </div>
          </div>
        ) : session.mode === "github" ? (
          <div className="flex items-center gap-3">
            <img src={session.user.avatarUrl} alt="" className="size-10 rounded-full border" referrerPolicy="no-referrer" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" data-testid="text-user-name">
                {session.user.name ?? session.user.login}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">@{session.user.login}</p>
            </div>
          </div>
        ) : null}
      </section>

      <h2 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">Continue</h2>
      <div className="space-y-2">
        {session.mode === "github" ? (
          recent.length ? (
            recent.map((r) => (
              <ProjectCard
                key={`${r.owner}/${r.name}`}
                testId={`card-recent-${r.owner}-${r.name}`}
                href={projectPath(r.owner, r.name)}
                title={`${r.owner}/${r.name}`}
                meta={
                  <>
                    <span className="inline-flex items-center gap-1 font-mono">
                      <GitBranch className="size-3" aria-hidden /> {r.branch}
                    </span>
                    <span aria-hidden>·</span>
                    <span>Opened {timeAgo(new Date(r.openedAt))}</span>
                  </>
                }
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Pick a repository to start working.
              <Button asChild className="mt-3 w-full">
                <Link href="/app/projects">Browse repositories</Link>
              </Button>
            </div>
          )
        ) : (
          <ProjectCard
            testId="card-continue-demo"
            href={projectPath(DEMO_PROJECT.owner, DEMO_PROJECT.name)}
            title={`${DEMO_PROJECT.owner}/${DEMO_PROJECT.name}`}
            meta={
              <>
                <span className="inline-flex items-center gap-1 font-mono">
                  <GitBranch className="size-3" aria-hidden /> {DEMO_PROJECT.defaultBranch}
                </span>
                <span aria-hidden>·</span>
                <span>{PROJECT_KIND_LABEL[kind]}</span>
                <span aria-hidden>·</span>
                <span className="tabular">{DEMO_FILES.length} files</span>
              </>
            }
          />
        )}
      </div>

    </AppShell>
  );
}
