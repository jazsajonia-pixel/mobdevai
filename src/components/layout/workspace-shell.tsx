import type { ReactNode } from "react";
import { Link } from "wouter";
import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, GitBranch, Lock, Play, Menu, X } from "lucide-react";
import { WORKSPACE_NAV_TABS, WORKSPACE_TAB_META, projectPath, type WorkspaceTab } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { ProjectRef } from "@/types/workspace";
import { Badge } from "@/components/ui/badge";
import { useOptionalWorkspace } from "@/features/workspace/context";
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
  const [open, setOpen] = useState(false);
  const badge = gitBadge ?? (ws ? ws.changes.length : 0);
  return (
    // Fixed-height column: header · scrolling main · tab bar. The editor fills `main` exactly,
    // and with interactive-widget=resizes-content the whole column shrinks above the keyboard.
    <div className="flex h-dvh flex-col overflow-hidden md:pl-64">
      {open ? <button type="button" aria-label="Close workspace navigation" className="fixed inset-0 z-40 bg-black/35 md:hidden" onClick={() => setOpen(false)} /> : null}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-surface transition-transform md:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-16 items-center justify-between border-b px-4"><span className="text-sm font-semibold">Workspace</span><button type="button" className="grid size-9 place-items-center md:hidden" aria-label="Close workspace navigation" onClick={() => setOpen(false)}><X className="size-5" /></button></div>
        <nav className="space-y-1 p-3" aria-label="Workspace">{WORKSPACE_NAV_TABS.map((t) => { const meta = WORKSPACE_TAB_META[t]; const active = t === tab; return <Link key={t} href={projectPath(project.owner, project.name, t)} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} data-testid={`tab-${t}`} className={cn("flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2")}><meta.icon className="size-5" aria-hidden />{meta.label}{t === "git" && badge > 0 ? <span data-testid="badge-changes" className="ml-auto rounded-full bg-primary px-2 text-xs text-primary-foreground">{badge > 99 ? "99+" : badge}</span> : null}</Link>; })}</nav>
      </aside>
      <nav aria-label="Accessibility links"><SkipLink /></nav>
      <header className="z-30 shrink-0 bg-background pt-safe">
        <OfflineBanner />

        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-1 border-b pl-1 pr-3 md:pl-3"><button type="button" onClick={() => setOpen(true)} aria-label="Open workspace navigation" data-testid="button-toggle-workspace-sidebar" className="grid size-9 place-items-center md:hidden"><Menu className="size-5" /></button>
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


    </div>
  );
}
