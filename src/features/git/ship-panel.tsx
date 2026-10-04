import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, GitBranchPlus, GitCommitHorizontal, GitPullRequest, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmSheet } from "@/components/dialogs";
import { cn } from "@/lib/utils";
import { AppError, describeError } from "@/lib/errors";
import { useWorkspace } from "@/features/workspace/context";
import type { FileChange } from "@/features/workspace/model";
import { githubApi } from "@/features/github/api";
import { markTasksShipped, tasksForPaths } from "@/features/agent/store";
import { branchNameError, generateCommitMessage, suggestBranchName } from "./message";
import { addDemoCommit, fakeSha, saveLastShip, type ShipRecord } from "./ship-store";

/** Everything the Git tab needs to know about where changes can go. */
export interface GitTarget {
  owner: string;
  repo: string;
  /** Branch the workspace is on. */
  branch: string;
  defaultBranch: string;
  /** Known branch names (for unique working-branch names). */
  branchNames: readonly string[];
  canPush: boolean;
  isDemo: boolean;
  /** Workspace storage key for another branch of this repo. */
  workspaceKeyFor: (branch: string) => string;
  /** Called after a successful commit; the parent switches to / reloads `branch`. */
  onShipped: (branch: string) => void;
}

type Mode = "new" | "current";
type Phase =
  | { kind: "idle" }
  | { kind: "working"; step: "commit" | "pr" }
  | { kind: "error"; error: unknown };

export function prBody(message: string): string {
  const body = message.split("\n").slice(1).join("\n").trim();
  return `${body}\n\n---\nOpened from Mobile Development AI. Review the diff before merging.`.trim();
}

/** Commit selected changes, push, and optionally open a PR. Working branch by default. */
export function ShipPanel({ target, selected }: { target: GitTarget; selected: FileChange[] }) {
  const ws = useWorkspace();
  const { owner, repo, branch, defaultBranch, isDemo } = target;
  const onDefault = branch === defaultBranch;
  const paths = useMemo(() => selected.map((c) => c.path), [selected]);
  const tasks = useMemo(() => tasksForPaths(ws.source.storageKey, paths), [ws.source.storageKey, paths]);
  const generated = useMemo(() => generateCommitMessage(selected, { taskTitles: tasks.map((t) => t.title) }), [selected, tasks]);

  const [mode, setMode] = useState<Mode>("new");
  const [message, setMessage] = useState(generated);
  const edited = useRef(false);
  useEffect(() => {
    if (!edited.current) setMessage(generated);
  }, [generated]);

  const suggested = useMemo(() => suggestBranchName(tasks[0]?.title ?? generated.split("\n")[0]!, target.branchNames), [tasks, generated, target.branchNames]);
  const [branchName, setBranchName] = useState(suggested);
  const nameEdited = useRef(false);
  useEffect(() => {
    if (!nameEdited.current) setBranchName(suggested);
  }, [suggested]);

  const targetBranch = mode === "new" ? branchName.trim() : branch;
  // PR base: the branch we branched from, or the default branch when committing to a feature branch.
  const prBase = mode === "new" ? branch : onDefault ? null : defaultBranch;
  const [openPr, setOpenPr] = useState(true);
  const willOpenPr = !!prBase && openPr;

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [confirm, setConfirm] = useState(false);

  const draftsInSelection = paths.filter((p) => p in ws.data.drafts);
  const nameErr = mode === "new" ? (branchNameError(targetBranch) ?? (target.branchNames.includes(targetBranch) ? "A branch with this name already exists." : null)) : null;
  const subject = message.split("\n")[0]!.trim();
  const blocked =
    !selected.length ? "Select at least one file to commit." :
    draftsInSelection.length ? `Save or discard unsaved edits in ${draftsInSelection.join(", ")} first.` :
    !isDemo && !target.canPush ? "You don't have push access to this repository." :
    nameErr ?? (!subject ? "Write a commit message." : null);
  const working = phase.kind === "working";

  async function ship() {
    setConfirm(false);
    setPhase({ kind: "working", step: "commit" });
    const taskIds = tasks.map((t) => t.id);
    try {
      if (isDemo) {
        // Clearly simulated: nothing leaves the device.
        await new Promise((r) => setTimeout(r, 700));
        const sha = fakeSha();
        const rec: ShipRecord = { owner, repo, branch: targetBranch, from: branch, sha, url: null, message, files: selected.length, created: mode === "new", pr: willOpenPr ? { number: 0, url: "", existing: false } : null, prError: null, at: new Date().toISOString(), simulated: true };
        addDemoCommit(rec);
        saveLastShip(rec);
        markTasksShipped(ws.source.storageKey, taskIds, { sha, url: null, branch: targetBranch, at: rec.at, simulated: true });
        setPhase({ kind: "idle" });
        target.onShipped(branch);
        return;
      }
      const baseSha = ws.data.baseSha;
      const res = await githubApi.commit(owner, repo, {
        branch: targetBranch,
        ...(mode === "new" ? { createFrom: baseSha } : {}),
        baseSha,
        message,
        files: selected.map((c) => ({ path: c.path, content: c.status === "deleted" ? null : (c.content ?? "") })),
        ...(mode === "current" && onDefault ? { allowDefaultBranch: true } : {}),
      });

      let pr: ShipRecord["pr"] = null;
      let prError: string | null = null;
      if (willOpenPr && prBase) {
        setPhase({ kind: "working", step: "pr" });
        try {
          const r = await githubApi.createPull(owner, repo, { head: targetBranch, base: prBase, title: subject, body: prBody(message) });
          pr = { number: r.pull.number, url: r.pull.url, existing: r.existing };
        } catch (e) {
          prError = e instanceof AppError ? e.message || describeError(e).title : "Couldn't open the pull request.";
        }
      }
      const rec: ShipRecord = { owner, repo, branch: targetBranch, from: branch, sha: res.commit.sha, url: res.commit.url, message, files: res.files, created: res.created, pr, prError, at: new Date().toISOString(), simulated: false };
      saveLastShip(rec);
      markTasksShipped(ws.source.storageKey, taskIds, { sha: rec.sha, url: rec.url, branch: targetBranch, at: rec.at, pr: pr ? { number: pr.number, url: pr.url } : null });
      // The commit is on GitHub now: drop those local changes; carry the rest along when safe.
      const clean = res.parentSha === baseSha;
      ws.committed(paths, { newBaseSha: clean ? res.commit.sha : null, ...(mode === "new" ? { moveTo: target.workspaceKeyFor(targetBranch) } : {}) });
      setPhase({ kind: "idle" });
      target.onShipped(targetBranch);
    } catch (e) {
      setPhase({ kind: "error", error: e });
    }
  }

  const errInfo = phase.kind === "error" ? describeError(phase.error) : null;
  const errMessage = phase.kind === "error" && phase.error instanceof AppError ? phase.error.message : "";

  return (
    <section aria-labelledby="ship-title" className="overflow-hidden rounded-lg border bg-surface" data-testid="ship-panel">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <GitCommitHorizontal className="size-4 text-primary" aria-hidden />
        <h2 id="ship-title" className="flex-1 text-sm font-semibold">
          {isDemo ? "Commit & push (simulated)" : "Commit & push"}
        </h2>
        <span className="text-xs text-muted-foreground tabular" data-testid="text-selected-count">
          {selected.length} file{selected.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-4 p-3">
        {isDemo ? (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground" role="note">
            <span className="font-semibold text-warning">Demo:</span> this walks through the real flow, but nothing is sent to GitHub. Sign in to push to your repositories.
          </p>
        ) : null}

        <fieldset className="space-y-2" disabled={working}>
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Where should the commit go?</legend>
          <label className={cn("block rounded-md border p-3", mode === "new" && "border-primary bg-primary/5")}>
            <span className="flex items-center gap-2.5">
              <input type="radio" name="ship-mode" className="size-4 accent-[hsl(var(--primary))]" checked={mode === "new"} onChange={() => setMode("new")} data-testid="radio-new-branch" />
              <GitBranchPlus className="size-4 text-primary" aria-hidden />
              <span className="text-sm font-medium">New branch</span>
              <span className="ml-auto text-[11px] text-primary">Recommended</span>
            </span>
            {mode === "new" ? (
              <span className="mt-2 block space-y-1 pl-6">
                <input
                  value={branchName}
                  onChange={(e) => {
                    nameEdited.current = true;
                    setBranchName(e.target.value);
                  }}
                  aria-label="New branch name"
                  aria-invalid={!!nameErr}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className={cn("h-11 w-full rounded-md border bg-background px-3 font-mono text-base sm:text-sm", nameErr && "border-danger")}
                  data-testid="input-branch-name"
                />
                {nameErr ? (
                  <span className="block text-xs text-danger" data-testid="text-branch-error">{nameErr}</span>
                ) : (
                  <span className="block text-xs text-muted-foreground">
                    From <span className="font-mono">{branch}</span> — {branch} itself stays untouched.
                  </span>
                )}
              </span>
            ) : null}
          </label>
          <label className={cn("block rounded-md border p-3", mode === "current" && (onDefault ? "border-warning bg-warning/5" : "border-primary bg-primary/5"))}>
            <span className="flex items-center gap-2.5">
              <input type="radio" name="ship-mode" className="size-4 accent-[hsl(var(--primary))]" checked={mode === "current"} onChange={() => setMode("current")} data-testid="radio-current-branch" />
              <GitCommitHorizontal className="size-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 text-sm font-medium">
                Commit to <span className="font-mono">{branch}</span>
              </span>
            </span>
            {mode === "current" ? (
              <span className={cn("mt-1.5 block pl-6 text-xs", onDefault ? "text-warning" : "text-muted-foreground")}>
                {onDefault ? `Directly updates the default branch. You'll be asked to confirm.` : `Adds one commit on top of ${branch}. Fast-forward only — never a force-push.`}
              </span>
            ) : null}
          </label>
        </fieldset>

        <div className="space-y-1.5">
          <div className="flex items-center">
            <label htmlFor="commit-message" className="flex-1 text-xs font-medium text-muted-foreground">
              Commit message
            </label>
            <Button
              variant="ghost"
              size="sm"
              disabled={working || message === generated}
              onClick={() => {
                edited.current = false;
                setMessage(generated);
              }}
              data-testid="button-regenerate-message"
            >
              <RefreshCw className="size-3.5" aria-hidden /> Regenerate
            </Button>
          </div>
          <textarea
            id="commit-message"
            value={message}
            onChange={(e) => {
              edited.current = true;
              setMessage(e.target.value);
            }}
            disabled={working}
            rows={6}
            spellCheck
            className="w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-base leading-snug sm:text-[13px]"
            data-testid="input-commit-message"
          />
          <p className="text-[11px] text-muted-foreground">Generated from the selected changes{tasks.length ? " and the AI task that made them" : ""}. Edit freely.</p>
        </div>

        {prBase ? (
          <div className="flex items-center gap-2 rounded-md border px-3">
            <GitPullRequest className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 py-2 text-sm">
              Open a pull request into <span className="font-mono">{prBase}</span>
            </span>
            <Switch checked={openPr} onCheckedChange={setOpenPr} label="Open a pull request" disabled={working} data-testid="switch-open-pr" />
          </div>
        ) : null}

        {phase.kind === "error" && errInfo ? (
          <div role="alert" className="space-y-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm" data-testid="ship-error">
            <p className="flex items-start gap-2 font-semibold">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden /> {errInfo.title}
            </p>
            {errMessage ? <p className="text-muted-foreground">{errMessage}</p> : null}
            <p className="text-muted-foreground">{errInfo.hint}</p>
            {errInfo.code === "GIT_CONFLICT" || errInfo.code === "BRANCH_PROTECTED" ? (
              <Button variant="secondary" size="sm" onClick={() => (setMode("new"), setPhase({ kind: "idle" }))} data-testid="button-use-new-branch">
                <GitBranchPlus className="size-4" aria-hidden /> Use a new branch instead
              </Button>
            ) : errInfo.code === "BRANCH_EXISTS" ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  nameEdited.current = true;
                  setBranchName(suggestBranchName(targetBranch, [...target.branchNames, targetBranch]));
                  setPhase({ kind: "idle" });
                }}
              >
                Pick another name
              </Button>
            ) : null}
          </div>
        ) : null}

        {blocked && selected.length ? <p className="text-xs text-warning" data-testid="text-ship-blocked">{blocked}</p> : null}

        <Button className="w-full" disabled={!!blocked || working} onClick={() => setConfirm(true)} data-testid="button-commit">
          {working ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> {phase.step === "pr" ? "Opening pull request…" : isDemo ? "Simulating…" : "Committing & pushing…"}
            </>
          ) : isDemo ? (
            `Simulate commit (${selected.length})`
          ) : (
            `Commit & push ${selected.length} file${selected.length === 1 ? "" : "s"}`
          )}
        </Button>
      </div>

      <ConfirmSheet
        open={confirm}
        onOpenChange={setConfirm}
        title={isDemo ? "Simulate this commit?" : mode === "current" && onDefault ? `Commit directly to ${branch}?` : "Commit and push?"}
        description={
          isDemo
            ? "Demo mode — nothing is sent to GitHub. You'll see what a real commit would look like."
            : mode === "current" && onDefault
              ? `This updates ${branch}, the default branch, without a pull request. A new branch is safer.`
              : undefined
        }
        confirmLabel={isDemo ? "Simulate" : mode === "current" && onDefault ? `Commit to ${branch}` : "Commit & push"}
        danger={!isDemo && mode === "current" && onDefault}
        onConfirm={ship}
      >
        <dl className="mb-3 space-y-2 rounded-md border bg-background p-3 text-sm" data-testid="ship-summary">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">Branch</dt>
            <dd className="min-w-0 break-all font-mono text-[13px]">
              {targetBranch}
              {mode === "new" ? <span className="font-sans text-muted-foreground"> (new, from {branch})</span> : null}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">Files</dt>
            <dd className="min-w-0">
              {selected.length} — {selected.slice(0, 4).map((c) => c.path.slice(c.path.lastIndexOf("/") + 1)).join(", ")}
              {selected.length > 4 ? ` +${selected.length - 4}` : ""}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">Message</dt>
            <dd className="min-w-0 break-words">{subject}</dd>
          </div>
          {willOpenPr ? (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-muted-foreground">PR</dt>
              <dd>
                {targetBranch} → <span className="font-mono text-[13px]">{prBase}</span>
              </dd>
            </div>
          ) : null}
        </dl>
      </ConfirmSheet>
    </section>
  );
}
