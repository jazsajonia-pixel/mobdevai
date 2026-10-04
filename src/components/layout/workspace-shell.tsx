import type { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronLeft, ChevronRight, GitBranch, Lock, Play } from "lucide-react";
import { WORKSPACE_NAV_TABS, WORKSPACE_TAB_META, projectPath, type WorkspaceTab } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { ProjectRef } from "@/types/workspace";
import { Badge } from "@/components/ui/badge";
import { useOptionalWorkspace } from "@/features/workspace/context";
import { DemoBanner } from "./demo-banner";
import { SkipLink } from "./app-shell";
import { OfflineBanner } from "./offline-banner";

/** Inside a repository the global nav is replaced by Files / AI / Preview / Git. */
export function WorkspaceShell({
  project,
  branch,
  tab,
  onBranchClick,
  gitBadge,
  children,
}: {
  project: ProjectRef;
  branch: string;
  tab: WorkspaceTab;
  /** When provided the branch label becomes a button that opens the branch picker. */
  onBranchClick?: () => void;
  /** Number of changed files, shown on the Git tab. */
  gitBadge?: number;
  children: ReactNode;
}) {
  const ws = useOptionalWorkspace();
  const badge = gitBadge ?? (ws ? ws.changes.length : 0);
  return (
    // Fixed-height column: header · scrolling main · tab bar. The editor fills `main` exactly,
    // and with interactive-widget=resizes-content the whole column shrinks above the keyboard.
    <div className="flex h-dvh flex-col overflow-hidden">
      <SkipLink />
      <header className="z-30 shrink-0 bg-background pt-safe">
        <OfflineBanner />
        <DemoBanner />
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-1 border-b pl-1 pr-3">
          <Link href="/app/projects" aria-label="Back to projects" className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-surface-2">
            <ChevronLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={projectPath(project.owner, project.name, "overview")}
              aria-current={tab === "overview" ? "page" : undefined}
              aria-label={`${project.owner}/${project.name} — project overview`}
              className="-mx-1 block max-w-full truncate rounded px-1 text-sm font-semibold hover:bg-surface-2"
              data-testid="link-overview"
            >
              <span data-testid="text-repo-name">
                <span className="text-muted-foreground">{project.owner}/</span>
                {project.name}
              </span>
              <ChevronRight className="ml-0.5 inline size-3.5 align-[-2px] text-muted-foreground" aria-hidden />
            </Link>
            {onBranchClick ? (
              <button
                type="button"
                onClick={onBranchClick}
                data-testid="button-branch"
                className="-mx-1 -my-1 flex max-w-full items-center gap-1 rounded px-1 py-1 font-mono text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <GitBranch className="size-3 shrink-0" aria-hidden />
                <span className="truncate" data-testid="text-branch">{branch}</span>
                <ChevronDown className="size-3 shrink-0" aria-hidden />
              </button>
            ) : (
              <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground" data-testid="text-branch">
                <GitBranch className="size-3" aria-hidden /> {branch}
              </p>
            )}
          </div>
          {project.source === "demo" ? (
            <Badge tone="warning">Demo</Badge>
          ) : project.visibility === "private" ? (
            <Badge>
              <Lock className="size-3" aria-hidden /> Private
            </Badge>
          ) : null}
          {tab !== "preview" ? (
            <Link
              href={projectPath(project.owner, project.name, "preview")}
              data-testid="button-header-preview"
              className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Play className="size-3.5 fill-current" aria-hidden /> Preview
            </Link>
          ) : null}
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-y-auto outline-none">{children}</main>

      <nav aria-label="Workspace" className="z-30 shrink-0 border-t bg-surface pb-safe">
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {WORKSPACE_NAV_TABS.map((t) => {
            const meta = WORKSPACE_TAB_META[t];
            const active = t === tab;
            return (
              <li key={t}>
                <Link
                  href={projectPath(project.owner, project.name, t)}
                  aria-current={active ? "page" : undefined}
                  data-testid={`tab-${t}`}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="relative">
                    <meta.icon className={cn("size-5", active && "text-primary")} aria-hidden />
                    {t === "git" && badge > 0 ? (
                      <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground tabular" data-testid="badge-changes">
                        {badge > 99 ? "99+" : badge}
                        <span className="sr-only"> changed files</span>
                      </span>
                    ) : null}
                  </span>
                  {meta.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
