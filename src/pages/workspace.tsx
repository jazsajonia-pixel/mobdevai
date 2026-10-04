import { useMemo, useState } from "react";
import { ChevronLeft, FolderGit2, Search } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { PhaseBoundary } from "@/components/phase-boundary";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/layout/app-shell";
import { FileTree } from "@/features/editor/file-tree";
import { CodeViewer } from "@/features/editor/code-viewer";
import { DEMO_FILES, DEMO_PROJECT } from "@/features/demo/sample-project";
import { isWorkspaceTab, type WorkspaceTab } from "@/lib/nav";
import { PROJECT_KIND_LABEL, buildTree, detectProjectKind } from "@/lib/tree";
import type { ProjectRef, WorkspaceFile } from "@/types/workspace";
import { Link } from "wouter";

function FilesTab({ files }: { files: WorkspaceFile[] }) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const tree = useMemo(() => buildTree(files), [files]);
  const matches = filter.trim() ? files.filter((f) => f.path.toLowerCase().includes(filter.trim().toLowerCase())) : null;
  const open = openPath ? files.find((f) => f.path === openPath) : undefined;

  if (open) {
    return (
      <div className="px-3 pt-2">
        <div className="mb-2 flex items-center gap-1">
          <Button variant="ghost" size="sm" className="-ml-1" onClick={() => setOpenPath(null)} data-testid="button-back-files">
            <ChevronLeft /> Files
          </Button>
          <p className="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground" data-testid="text-open-path">
            {open.path}
          </p>
        </div>
        <CodeViewer file={open} />
        <p className="mt-3 px-1 text-xs text-muted-foreground">Editing, tabs, search and undo arrive with the mobile editor (Phase 2).</p>
      </div>
    );
  }

  return (
    <div>
      <div className="px-3 pt-3">
        <label className="relative block">
          <span className="sr-only">Filter files</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Go to file"
            data-testid="input-filter-files"
            className="h-11 w-full rounded-md border bg-surface pl-9 pr-3 font-mono text-base placeholder:font-sans placeholder:text-muted-foreground sm:text-sm"
          />
        </label>
      </div>
      {matches ? (
        matches.length ? (
          <ul className="py-1">
            {matches.map((f) => (
              <li key={f.path}>
                <button type="button" onClick={() => setOpenPath(f.path)} className="flex h-11 w-full items-center px-4 text-left font-mono text-[13px] hover:bg-surface-2">
                  <span className="truncate">{f.path}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No files match" className="py-8" />
        )
      ) : (
        <FileTree nodes={tree} onOpen={setOpenPath} />
      )}
    </div>
  );
}

function TabBody({ tab, project, files }: { tab: WorkspaceTab; project: ProjectRef; files: WorkspaceFile[] }) {
  const kind = detectProjectKind(files);
  switch (tab) {
    case "files":
      return <FilesTab files={files} />;
    case "ai":
      return (
        <div className="p-4">
          <PhaseBoundary
            phase={4}
            title="Ask the agent about this project"
            description="The agent will inspect this repository, propose a plan, and generate diffs you can accept or reject file by file."
            planned={["Explain, fix, implement, review", "Attach the current file or @mention files", "Every tool call logged in the task view"]}
          />
        </div>
      );
    case "preview":
      return (
        <div className="p-4">
          <PhaseBoundary
            phase={5}
            title={`Preview · ${PROJECT_KIND_LABEL[kind]}`}
            description={
              kind === "unknown"
                ? "This project requires a runtime that Mobile Development AI cannot run in-browser yet."
                : "This project type is browser-compatible. The sandboxed live preview runtime is being built next."
            }
            planned={["Full-screen mobile preview", "Reload and open in new tab", "Build and runtime error diagnostics"]}
          />
        </div>
      );
    case "git":
      return (
        <div className="space-y-4 p-4">
          <div className="rounded-lg border bg-surface p-4 text-sm">
            <p className="font-semibold">Working tree clean</p>
            <p className="mt-1 text-muted-foreground">
              {project.source === "demo"
                ? "Demo project — commits and pushes are never sent to GitHub."
                : `On ${project.defaultBranch}. Changes are never written directly to this branch.`}
            </p>
          </div>
          <PhaseBoundary
            phase={6}
            title="Branch, commit, push, PR"
            description="AI changes go to a working branch named ai/mobile-development-ai/<task>, never silently to main."
            planned={["Generated, editable commit message", "Push and open a pull request", "Destructive operations require confirmation"]}
          />
        </div>
      );
  }
}

export default function WorkspacePage({ params }: { params: { owner: string; repo: string; tab?: string } }) {
  const owner = decodeURIComponent(params.owner);
  const repo = decodeURIComponent(params.repo);
  const tab: WorkspaceTab = isWorkspaceTab(params.tab) ? params.tab : "files";

  const isDemo = owner === DEMO_PROJECT.owner && repo === DEMO_PROJECT.name;

  if (!isDemo) {
    // TODO(phase-1): resolve via GET /api/github/repos/:owner/:repo and load the tree.
    return (
      <AppShell title={`${owner}/${repo}`}>
        <EmptyState
          icon={<FolderGit2 className="size-5" />}
          title="GitHub projects aren't available yet"
          action={
            <Button asChild variant="secondary">
              <Link href="/app/projects">Back to projects</Link>
            </Button>
          }
        >
          Opening repositories from GitHub arrives in Phase 1. The demo project is available now.
        </EmptyState>
      </AppShell>
    );
  }

  return (
    <WorkspaceShell project={DEMO_PROJECT} branch={DEMO_PROJECT.defaultBranch} tab={tab}>
      <TabBody tab={tab} project={DEMO_PROJECT} files={DEMO_FILES} />
    </WorkspaceShell>
  );
}
