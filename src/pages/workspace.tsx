import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ExternalLink, FolderGit2, ShieldAlert } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { AppShell } from "@/components/layout/app-shell";
import { PhaseBoundary } from "@/components/phase-boundary";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FilesPanel } from "@/features/editor/files-panel";
import { BranchPicker } from "@/features/github/branch-picker";
import { githubApi } from "@/features/github/api";
import { lastBranch, rememberRepo } from "@/features/github/recent";
import { DEMO_FILES, DEMO_PROJECT } from "@/features/demo/sample-project";
import { useAsync } from "@/hooks/use-async";
import { useSession } from "@/stores/session";
import { isWorkspaceTab, type WorkspaceTab } from "@/lib/nav";
import { PROJECT_KIND_LABEL, detectProjectKind, detectProjectKindFromPaths } from "@/lib/tree";
import { describeError } from "@/lib/errors";
import type { ProjectKind, ProjectRef, WorkspaceFile } from "@/types/workspace";
import type { RepoSummary } from "@/types/github";

/* ── Shared tab bodies ─────────────────────────────────────────────── */

function AiTab() {
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
}

function PreviewTab({ kind }: { kind: ProjectKind | null }) {
  return (
    <div className="p-4">
      <PhaseBoundary
        phase={5}
        title={`Preview · ${kind ? PROJECT_KIND_LABEL[kind] : "detecting…"}`}
        description={
          kind === "unknown"
            ? "This project requires a runtime that Mobile Development AI cannot run in-browser yet."
            : "This project type looks browser-compatible. The sandboxed live preview runtime is being built."
        }
        planned={["Full-screen mobile preview", "Reload and open in new tab", "Build and runtime error diagnostics"]}
      />
    </div>
  );
}

function GitTab({ project, branch, repo }: { project: ProjectRef; branch: string; repo?: RepoSummary }) {
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-lg border bg-surface p-4 text-sm">
        <p className="font-semibold">Working tree clean</p>
        <p className="mt-1 text-muted-foreground">
          {project.source === "demo"
            ? "Demo project — commits and pushes are never sent to GitHub."
            : `On ${branch}. Nothing has been changed in this workspace yet.`}
        </p>
      </div>
      {repo && !repo.permissions.push ? (
        <div role="note" className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            <span className="font-semibold">Read-only access.</span>{" "}
            <span className="text-muted-foreground">You can browse this repository but can't push to it. Fork it on GitHub to make changes.</span>
          </p>
        </div>
      ) : null}
      <PhaseBoundary
        phase={6}
        title="Branch, commit, push, PR"
        description="AI changes go to a working branch named ai/mobile-development-ai/<task>, never silently to the default branch."
        planned={["Generated, editable commit message", "Push and open a pull request", "Destructive operations require confirmation"]}
      />
    </div>
  );
}

/* ── Demo workspace ───────────────────────────────────────────────── */

function DemoWorkspace({ tab }: { tab: WorkspaceTab }) {
  const paths = useMemo(() => DEMO_FILES.map((f) => f.path), []);
  const loadFile = useCallback(async (path: string): Promise<WorkspaceFile> => {
    const f = DEMO_FILES.find((x) => x.path === path);
    if (!f) throw new Error("missing demo file");
    return f;
  }, []);

  return (
    <WorkspaceShell project={DEMO_PROJECT} branch={DEMO_PROJECT.defaultBranch} tab={tab}>
      {tab === "files" ? (
        <FilesPanel paths={paths} loadFile={loadFile} cacheKey="demo" />
      ) : tab === "ai" ? (
        <AiTab />
      ) : tab === "preview" ? (
        <PreviewTab kind={detectProjectKind(DEMO_FILES)} />
      ) : (
        <GitTab project={DEMO_PROJECT} branch={DEMO_PROJECT.defaultBranch} />
      )}
    </WorkspaceShell>
  );
}

/* ── GitHub workspace ─────────────────────────────────────────────── */

function toProjectRef(repo: RepoSummary): ProjectRef {
  return {
    id: `github/${repo.fullName}`,
    source: "github",
    owner: repo.owner,
    name: repo.name,
    defaultBranch: repo.defaultBranch,
    visibility: repo.private ? "private" : "public",
    description: repo.description ?? undefined,
  };
}

function GitHubWorkspace({ owner, name, tab }: { owner: string; name: string; tab: WorkspaceTab }) {
  const repo = useAsync(() => githubApi.repo(owner, name), [owner, name]);
  const branches = useAsync(() => githubApi.branches(owner, name), [owner, name]);
  const [branch, setBranch] = useState<string | null>(() => lastBranch(owner, name));
  const [pickerOpen, setPickerOpen] = useState(false);

  // Fall back to the default branch once metadata arrives (or if the remembered branch is gone).
  useEffect(() => {
    if (repo.status !== "success") return;
    if (!branch) setBranch(repo.data.defaultBranch);
    else if (branches.status === "success" && !branches.data.branches.some((b) => b.name === branch) && !branches.data.truncated) {
      setBranch(repo.data.defaultBranch);
    }
  }, [repo, branches, branch]);

  useEffect(() => {
    if (branch && repo.status === "success") rememberRepo(owner, name, branch);
  }, [owner, name, branch, repo.status]);

  const tree = useAsync(
    () => (branch ? githubApi.tree(owner, name, branch) : new Promise<never>(() => {})),
    [owner, name, branch],
  );

  const paths = useMemo(() => (tree.status === "success" ? tree.data.entries.filter((e) => e.type === "blob").map((e) => e.path) : []), [tree]);

  const loadFile = useCallback(
    async (path: string): Promise<WorkspaceFile> => {
      const f = await githubApi.file(owner, name, branch!, path);
      return { path: f.path, content: f.content };
    },
    [owner, name, branch],
  );

  const placeholder: ProjectRef = {
    id: `github/${owner}/${name}`,
    source: "github",
    owner,
    name,
    defaultBranch: "…",
    visibility: "public",
  };
  const project = repo.status === "success" ? toProjectRef(repo.data) : placeholder;
  const shownBranch = branch ?? (repo.status === "success" ? repo.data.defaultBranch : "…");

  let body: React.ReactNode;
  if (repo.status === "error") {
    body = (
      <div className="space-y-3 p-4">
        <ErrorState error={repo.error} onRetry={repo.retry} />
        <Button asChild variant="secondary" className="w-full">
          <Link href="/app/projects">Back to projects</Link>
        </Button>
      </div>
    );
  } else if (tab === "files") {
    body =
      tree.status === "loading" ? (
        <div className="space-y-1 p-3" aria-label="Loading files">
          <Skeleton className="mb-3 h-11" />
          {[45, 60, 35, 70, 50, 40, 65].map((w, i) => (
            <Skeleton key={i} className="h-8" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : tree.status === "error" ? (
        describeError(tree.error).code === "EMPTY_REPOSITORY" ? (
          <EmptyState icon={<FolderGit2 className="size-5" />} title="This repository is empty" className="py-12">
            Push a first commit on GitHub, then come back.
          </EmptyState>
        ) : (
          <div className="p-4">
            <ErrorState error={tree.error} onRetry={tree.retry} />
          </div>
        )
      ) : (
        <FilesPanel
          paths={paths}
          loadFile={loadFile}
          cacheKey={`${owner}/${name}@${tree.data.commitSha}`}
          truncated={tree.data.truncated}
          githubUrl={(p) => `https://github.com/${owner}/${name}/blob/${encodeURIComponent(branch ?? "")}/${p.split("/").map(encodeURIComponent).join("/")}`}
        />
      );
  } else if (tab === "ai") {
    body = <AiTab />;
  } else if (tab === "preview") {
    body = <PreviewTab kind={tree.status === "success" ? detectProjectKindFromPaths(paths) : null} />;
  } else {
    body = <GitTab project={project} branch={shownBranch} repo={repo.status === "success" ? repo.data : undefined} />;
  }

  return (
    <WorkspaceShell project={project} branch={shownBranch} tab={tab} onBranchClick={repo.status === "success" ? () => setPickerOpen(true) : undefined}>
      {body}
      {repo.status === "success" ? (
        <>
          <div className="px-4 pb-4 pt-2">
            <a
              href={`https://github.com/${owner}/${name}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3.5" aria-hidden /> Open on GitHub
            </a>
          </div>
          <BranchPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            branches={branches}
            current={shownBranch}
            defaultBranch={repo.data.defaultBranch}
            onRetry={branches.retry}
            onSelect={(b) => {
              setBranch(b);
              setPickerOpen(false);
            }}
          />
        </>
      ) : null}
    </WorkspaceShell>
  );
}

/* ── Route ────────────────────────────────────────────────────────── */

export default function WorkspacePage({ params }: { params: { owner: string; repo: string; tab?: string } }) {
  const { session } = useSession();
  const owner = decodeURIComponent(params.owner);
  const repo = decodeURIComponent(params.repo);
  const tab: WorkspaceTab = isWorkspaceTab(params.tab) ? params.tab : "files";

  if (owner === DEMO_PROJECT.owner && repo === DEMO_PROJECT.name) return <DemoWorkspace tab={tab} />;

  if (session.mode !== "github") {
    return (
      <AppShell title={`${owner}/${repo}`}>
        <EmptyState
          icon={<FolderGit2 className="size-5" />}
          title="Sign in with GitHub to open this repository"
          action={
            <Button asChild>
              <Link href="/signin">Sign in</Link>
            </Button>
          }
        >
          You're in demo mode. Only the bundled demo project is available.
        </EmptyState>
      </AppShell>
    );
  }

  // Keyed so branch/tree state never leaks from one repository to the next.
  return <GitHubWorkspace key={`${owner}/${repo}`} owner={owner} name={repo} tab={tab} />;
}
