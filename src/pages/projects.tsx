import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Archive, ChevronRight, FlaskConical, GitBranch, GitFork, Lock, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { GitHubIcon } from "@/components/brand";
import { DEMO_PROJECT } from "@/features/demo/sample-project";
import { githubApi } from "@/features/github/api";
import { useSession } from "@/stores/session";
import { projectPath } from "@/lib/nav";
import { timeAgo } from "@/lib/utils";
import type { RepoSummary } from "@/types/github";

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid="input-search-projects"
        className="h-12 w-full rounded-xl border border-border/70 bg-surface/80 pl-10 pr-3 text-base shadow-sm placeholder:text-muted-foreground focus:border-primary/50 sm:text-sm"
      />
    </label>
  );
}

function DemoRow() {
  return (
    <Link href={projectPath(DEMO_PROJECT.owner, DEMO_PROJECT.name)} data-testid="row-project-pocket-tasks" className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
      <FlaskConical className="size-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="truncate">
            {DEMO_PROJECT.owner}/{DEMO_PROJECT.name}
          </span>
          <Badge tone="warning">demo</Badge>
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{DEMO_PROJECT.description}</p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function RepoRow({ repo }: { repo: RepoSummary }) {
  return (
    <Link href={projectPath(repo.owner, repo.name)} data-testid={`row-repo-${repo.fullName}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="truncate">
            <span className="font-normal text-muted-foreground">{repo.owner}/</span>
            {repo.name}
          </span>
          {repo.private ? (
            <Badge>
              <Lock className="size-3" aria-hidden /> private
            </Badge>
          ) : (
            <Badge>public</Badge>
          )}
        </p>
        {repo.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{repo.description}</p> : null}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-mono">
            <GitBranch className="size-3" aria-hidden /> {repo.defaultBranch}
          </span>
          {repo.language ? <span>{repo.language}</span> : null}
          {repo.pushedAt ? <span>Updated {timeAgo(new Date(repo.pushedAt))}</span> : null}
          {repo.fork ? (
            <span className="inline-flex items-center gap-1">
              <GitFork className="size-3" aria-hidden /> fork
            </span>
          ) : null}
          {repo.archived ? (
            <span className="inline-flex items-center gap-1 text-warning">
              <Archive className="size-3" aria-hidden /> archived
            </span>
          ) : null}
          {!repo.permissions.push ? <span>read-only</span> : null}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function GitHubProjects() {
  const { session } = useSession();
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<RepoSummary[][]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [status, setStatus] = useState<"loading" | "idle" | "more" | "error">("loading");
  const [error, setError] = useState<unknown>(null);

  const load = (page: number) => {
    setStatus(page === 1 ? "loading" : "more");
    setError(null);
    githubApi.repos(page).then(
      (res) => {
        setPages((p) => (page === 1 ? [res.repos] : [...p, res.repos]));
        setHasNext(res.hasNext);
        setStatus("idle");
      },
      (err: unknown) => {
        setError(err);
        setStatus("error");
      },
    );
  };

  useEffect(() => load(1), []);

  const repos = useMemo(() => pages.flat(), [pages]);
  const needle = query.trim().toLowerCase();
  const filtered = needle ? repos.filter((r) => r.fullName.toLowerCase().includes(needle) || r.description?.toLowerCase().includes(needle)) : repos;
  const includePrivate = session.mode === "github" && session.includePrivate;

  return (
    <>
      <SearchBox value={query} onChange={setQuery} placeholder="Search repositories" />

      {status === "loading" ? (
        <div className="mt-4 overflow-hidden rounded-lg border" aria-label="Loading repositories">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 border-b px-4 py-4 last:border-b-0">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : status === "error" && repos.length === 0 ? (
        <ErrorState className="mt-4" error={error} onRetry={() => load(1)} />
      ) : repos.length === 0 ? (
        <EmptyState icon={<GitHubIcon className="size-5" />} title="No repositories yet">
          Create a repository on GitHub, then reload this page.
        </EmptyState>
      ) : (
        <>
          <p className="mb-2 mt-4 text-xs text-muted-foreground" data-testid="text-repo-count">
            {needle ? `${filtered.length} of ${repos.length} loaded` : `${repos.length}${hasNext ? "+" : ""} repositories`} · most recently pushed first
          </p>
          {filtered.length ? (
            <ul className="studio-panel overflow-hidden" data-testid="list-repos">
              {filtered.map((r) => (
                <li key={r.id} className="border-b last:border-b-0">
                  <RepoRow repo={r} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No matching repositories" className="py-8">
              {hasNext ? "Only loaded repositories are searched — load more to search further." : "Try a different search."}
            </EmptyState>
          )}
          {status === "error" ? <ErrorState className="mt-3" error={error} onRetry={() => load(pages.length + 1)} /> : null}
          {hasNext && status !== "error" ? (
            <Button variant="secondary" className="mt-3 w-full" disabled={status === "more"} onClick={() => load(pages.length + 1)} data-testid="button-load-more">
              {status === "more" ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </>
      )}

      {!includePrivate && !repos.some((r) => r.private) && status !== "loading" ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Private repositories are hidden because you signed in with public access only. Sign out and sign in again with “Include private repositories” to see them.
        </p>
      ) : null}

      <h2 className="mb-2 mt-8 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sample</h2>
      <div className="studio-panel overflow-hidden">
        <DemoRow />
      </div>
    </>
  );
}

function DemoProjects() {
  const [query, setQuery] = useState("");
  const show = `${DEMO_PROJECT.owner}/${DEMO_PROJECT.name}`.includes(query.trim().toLowerCase());
  return (
    <>
      <SearchBox value={query} onChange={setQuery} placeholder="Search projects" />
      {show ? (
        <div className="mt-4 overflow-hidden rounded-lg border">
          <DemoRow />
        </div>
      ) : (
        <EmptyState title="No matching projects" className="py-8">
          Try a different search.
        </EmptyState>
      )}
      <div className="mt-6 flex items-center gap-3 rounded-lg border border-dashed p-4">
        <GitHubIcon className="size-5 shrink-0 text-muted-foreground" />
        <p className="flex-1 text-sm text-muted-foreground">Sign in with GitHub to open your own repositories.</p>
        <Button asChild size="sm" variant="secondary">
          <Link href="/signin">Sign in</Link>
        </Button>
      </div>
    </>
  );
}

export default function ProjectsPage() {
  const { session } = useSession();
  return <AppShell title="Projects"><div className="mb-7 flex items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Your codebase</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Projects</h2><p className="mt-1 max-w-lg text-sm text-muted-foreground">Open a repository and turn it into a focused Chrono workspace.</p></div><div className="hidden rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary sm:block">{session.mode === "github" ? "GitHub connected" : "Demo mode"}</div></div><div className="studio-panel p-4 sm:p-5">{session.mode === "github" ? <GitHubProjects /> : <DemoProjects />}</div></AppShell>;
}
