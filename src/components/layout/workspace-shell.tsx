import type { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronLeft, GitBranch } from "lucide-react";
import { WORKSPACE_TABS, WORKSPACE_TAB_META, projectPath, type WorkspaceTab } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { ProjectRef } from "@/types/workspace";
import { Badge } from "@/components/ui/badge";
import { DemoBanner } from "./demo-banner";
import { OfflineBanner } from "./offline-banner";

/** Inside a repository the global nav is replaced by Files / AI / Preview / Git. */
export function WorkspaceShell({
  project,
  branch,
  tab,
  children,
}: {
  project: ProjectRef;
  branch: string;
  tab: WorkspaceTab;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="sticky top-0 z-30 bg-background/90 pt-safe backdrop-blur">
        <OfflineBanner />
        <DemoBanner />
        <header className="mx-auto flex h-14 w-full max-w-3xl items-center gap-1 border-b pl-1 pr-3">
          <Link href="/app/projects" aria-label="Back to projects" className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-surface-2">
            <ChevronLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" data-testid="text-repo-name">
              <span className="text-muted-foreground">{project.owner}/</span>
              {project.name}
            </p>
            <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground" data-testid="text-branch">
              <GitBranch className="size-3" aria-hidden /> {branch}
            </p>
          </div>
          {project.source === "demo" ? <Badge tone="warning">Demo</Badge> : null}
        </header>
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 pb-28">{children}</main>

      <nav aria-label="Workspace" className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface/95 pb-safe backdrop-blur">
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {WORKSPACE_TABS.map((t) => {
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
                  <meta.icon className={cn("size-5", active && "text-primary")} aria-hidden />
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
