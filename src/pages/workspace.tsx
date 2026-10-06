import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ExternalLink, FolderGit2 } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FilesTab } from "@/features/editor/files-tab";
import { ChangesPanel } from "@/features/git/changes-panel";
import type { GitTarget } from "@/features/git/ship-panel";
import { ProjectDashboard } from "@/features/dashboard/project-dashboard";
import { WorkspaceProvider, useWorkspace, type WorkspaceSource } from "@/features/workspace/context";
import { workspaceKey } from "@/features/workspace/persist";
import { projectPath } from "@/lib/nav";
import { BranchPicker } from "@/features/github/branch-picker";
import { githubApi } from "@/features/github/api";
import { lastBranch, rememberRepo } from "@/features/github/recent";
import { DEMO_FILES, DEMO_PROJECT } from "@/features/demo/sample-project";
import { useAsync } from "@/hooks/use-async";
import { useSession } from "@/stores/session";
import { isWorkspaceTab, type WorkspaceTab } from "@/lib/nav";
import { describeError } from "@/lib/errors";
import type { ProjectRef } from "@/types/workspace";
import type { RepoSummary } from "@/types/github";

/* ── Shared tab bodies ─────────────────────────────────────────────── */

// Loaded on demand: Markdown rendering + agent code only ship when the AI tab opens.
const AgentPanel = lazy(() => import("@/features/agent/agent-panel").then((m) => ({ default: m.AgentPanel })));

function AiTab({ project, branch }: { project: ProjectRef; branch: string }) {
  return (
    <Suspense fallback={<div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-24" /></div>}>
      <AgentPanel project={{ owner: project.owner, repo: project.name, branch, source: project.source === "demo" ? "demo" : "github" }} />
    </Suspense>
  );
}

// Loaded on demand: the in-browser bundler (Sucrase) only ships when Preview opens.
const PreviewPanel = lazy(() => import("@/features/preview/preview-panel").then((m) => ({ default: m.PreviewPanel })));

function PreviewTab({ owner, name, assetUrl }: { owner: string; name: string; assetUrl?: (path: string) => string | null }) {
  return (
    <Suspense fallback={<div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>}>
      <PreviewPanel owner={owner} repo={name} assetUrl={assetUrl} />
    </Suspense>
  );
}

/* ── Demo workspace ───────────────────────────────────────────────── */

const DEMO_SOURCE: WorkspaceSource = {
  storageKey: workspaceKey("demo", DEMO_PROJECT.owner, DEMO_PROJECT.name, DEMO_PROJECT.defaultBranch),
  commitSha: "demo-v1",
  basePaths: DEMO_FILES.map((f) => f.path),
  baseSizes: new Map(DEMO_FILES.map((f) => [f.path, f.content.length])),
  loadBase: async (path) => {
    const f = DEMO_FILES.find((x) => x.path === path);
    if (!f) throw new Error("missing demo file");
    return f.content;
  },
};

function DemoWorkspace({ tab }: { tab: WorkspaceTab }) {
  const gitHref = projectPath(DEMO_PROJECT.owner, DEMO_PROJECT.name, "git");
  const [version, setVersion] = useState(0);
  const target: GitTarget = {
    owner: DEMO_PROJECT.owner,
    repo: DEMO_PROJECT.name,
    branch: DEMO_PROJECT.defaultBranch,
    defaultBranch: DEMO_PROJECT.defaultBranch,
    branchNames: [DEMO_PROJECT.defaultBranch],
    canPush: true,
    isDemo: true,
    workspaceKeyFor: (b) => workspaceKey("demo", DEMO_PROJECT.owner, DEMO_PROJECT.name, b),
    onShipped: () => setVersion((v) => v + 1),
  };
  return (
    <WorkspaceProvider source={DEMO_SOURCE}>
      <WorkspaceShell project={DEMO_PROJECT} branch={DEMO_PROJECT.defaultBranch} tab={tab}>
        {tab === "files" ? (
          <FilesTab gitHref={gitHref} />
        ) : tab === "ai" ? (
          <AiTab project={DEMO_PROJECT} branch={DEMO_PROJECT.defaultBranch} />
        ) : tab === "preview" ? (
          <PreviewTab owner={DEMO_PROJECT.owner} name={DEMO_PROJECT.name} />
        ) : tab === "overview" ? (
          <ProjectDashboard project={DEMO_PROJECT} target={target} syncedAt={null} />
        ) : (
          <EditFromGit owner={DEMO_PROJECT.owner} name={DEMO_PROJECT.name}>
            {(onEdit) => <ChangesPanel target={target} version={version} onEdit={onEdit} />}
          </EditFromGit>
        )}
      </WorkspaceShell>
    </WorkspaceProvider>
  );
}

/** Git → "edit this file" jumps to the Files tab with the file open. */
function EditFromGit({ owner, name, children }: { owner: string; name: string; children: (onEdit: (path: string) => void) => React.ReactNode }) {
  const [, navigate] = useLocation();
  const ws = useWorkspace();
  return <>{children((path) => {
    ws.openFile(path);
    navigate(projectPath(owner, name, "files"));
  })}</>;
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
  // Branches created from this app this session (the branch list may not include them yet).
  const [created, setCreated] = useState<ReadonlySet<string>>(() => new Set());
  const [gitVersion, setGitVersion] = useState(0);

  // Fall back to the default branch once metadata arrives (or if the remembered branch is gone).
  useEffect(() => {
    if (repo.status !== "success") return;
    if (!branch) setBranch(repo.data.defaultBranch);
    else if (branches.status === "success" && !created.has(branch) && !branches.data.branches.some((b) => b.name === branch) && !branches.data.truncated) {
      setBranch(repo.data.defaultBranch);
    }
  }, [repo, branches, branch, created]);

  useEffect(() => {
    if (branch && repo.status === "success") rememberRepo(owner, name, branch);
  }, [owner, name, branch, repo.status]);

  const tree = useAsync(
    () => (branch ? githubApi.tree(owner, name, branch) : new Promise<never>(() => {})),
    [owner, name, branch],
  );
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  useEffect(() => {
    if (tree.status === "success") setSyncedAt(new Date().toISOString());
  }, [tree.status, tree.data]);

  const source = useMemo<WorkspaceSource | null>(() => {
    if (tree.status !== "success" || !branch) return null;
    const blobs = tree.data.entries.filter((e) => e.type === "blob");
    return {
      storageKey: workspaceKey("github", owner, name, branch),
      commitSha: tree.data.commitSha,
      basePaths: blobs.map((e) => e.path),
      baseSizes: new Map(blobs.map((e) => [e.path, e.size ?? 0])),
      truncated: tree.data.truncated,
      // Pin reads to the commit so every file comes from the same snapshot.
      loadBase: async (path) => (await githubApi.file(owner, name, tree.data.commitSha, path)).content,
      githubUrl: (p) => `https://github.com/${owner}/${name}/blob/${encodeURIComponent(branch)}/${p.split("/").map(encodeURIComponent).join("/")}`,
    };
  }, [tree, owner, name, branch]);

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

  const gitTarget: GitTarget = {
    owner,
    repo: name,
    branch: shownBranch,
    defaultBranch: repo.status === "success" ? repo.data.defaultBranch : shownBranch,
    branchNames: [...(branches.status === "success" ? branches.data.branches.map((b) => b.name) : []), ...created],
    canPush: repo.status === "success" ? repo.data.permissions.push && !repo.data.archived : false,
    isDemo: false,
    workspaceKeyFor: (b) => workspaceKey("github", owner, name, b),
    onShipped: (b) => {
      setGitVersion((v) => v + 1);
      if (b !== shownBranch) {
        setCreated((s) => new Set(s).add(b));
        setBranch(b);
        branches.retry();
      } else {
        tree.retry();
      }
    },
  };

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
  } else if (tree.status === "loading" || !source) {
    body =
      tree.status === "error" ? null : (
        <div className="space-y-1 p-3" aria-label="Loading files">
          <Skeleton className="mb-3 h-11" />
          {[45, 60, 35, 70, 50, 40, 65].map((w, i) => (
            <Skeleton key={i} className="h-8" style={{ width: `${w}%` }} />
          ))}
        </div>
      );
  } else if (tab === "ai") {
    body = <AiTab project={project} branch={shownBranch} />;
  } else if (tab === "preview") {
    // Public repos: binary assets (images, fonts) load from raw.githubusercontent.com at the pinned commit.
    const pub = repo.status === "success" && !repo.data.private;
    const sha = tree.status === "success" ? tree.data.commitSha : null;
    body = (
      <PreviewTab
        owner={owner}
        name={name}
        assetUrl={pub && sha ? (p) => `https://raw.githubusercontent.com/${owner}/${name}/${sha}/${p.split("/").map(encodeURIComponent).join("/")}` : undefined}
      />
    );
  } else if (tab === "files") {
    body = <FilesTab gitHref={projectPath(owner, name, "git")} />;
  } else if (tab === "overview") {
    body = (
      <ProjectDashboard
        project={project}
        target={gitTarget}
        syncedAt={syncedAt}
        onRefresh={() => {
          tree.retry();
          branches.retry();
        }}
        onPickBranch={() => setPickerOpen(true)}
      />
    );
  } else {
    body = (
      <EditFromGit owner={owner} name={name}>
        {(onEdit) => (
          <ChangesPanel version={gitVersion} onEdit={onEdit} target={gitTarget} />
        )}
      </EditFromGit>
    );
  }
  if (repo.status !== "error" && tree.status === "error" && (tab === "files" || tab === "git" || tab === "ai" || tab === "preview")) {
    body =
      describeError(tree.error).code === "EMPTY_REPOSITORY" ? (
        <EmptyState icon={<FolderGit2 className="size-5" />} title="This repository is empty" className="py-12">
          Push a first commit on GitHub, then come back.
        </EmptyState>
      ) : (
        <div className="p-4">
          <ErrorState error={tree.error} onRetry={tree.retry} />
        </div>
      );
  }

  const shell = (
    <WorkspaceShell project={project} branch={shownBranch} tab={tab} onBranchClick={repo.status === "success" ? () => setPickerOpen(true) : undefined}>
      {body}
      {repo.status === "success" ? (
        <>
          {tab === "git" || !source ? (
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
          ) : null}
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

  // Keyed by branch + commit: switching branches swaps to that branch's own saved workspace.
  return source ? (
    <WorkspaceProvider key={`${source.storageKey}#${source.commitSha}`} source={source}>
      {shell}
    </WorkspaceProvider>
  ) : (
    shell
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
          You're in the sample workspace. Sign in with GitHub to open your own repositories.
        </EmptyState>
      </AppShell>
    );
  }

  // Keyed so branch/tree state never leaks from one repository to the next.
  return <GitHubWorkspace key={`${owner}/${repo}`} owner={owner} name={repo} tab={tab} />;
}
