import { useState } from "react";
import { CheckCircle2, ExternalLink, GitCommitHorizontal, GitPullRequest, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsync } from "@/hooks/use-async";
import { AppError, describeError } from "@/lib/errors";
import { githubApi } from "@/features/github/api";
import type { GitTarget } from "./ship-panel";
import { prBody } from "./ship-panel";
import { clearLastShip, loadLastShip, saveLastShip, type ShipRecord } from "./ship-store";

const short = (sha: string) => sha.slice(0, 7);

function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Result of the last commit — shown after the branch switch so the user sees what happened. */
function ShipResult({ rec, target, onClose }: { rec: ShipRecord; target: GitTarget; onClose: () => void }) {
  const [pr, setPr] = useState(rec.pr);
  const [prError, setPrError] = useState(rec.prError);
  const [busy, setBusy] = useState(false);
  const subject = rec.message.split("\n")[0];

  async function retryPr() {
    setBusy(true);
    try {
      const r = await githubApi.createPull(rec.owner, rec.repo, { head: rec.branch, base: rec.from === rec.branch ? target.defaultBranch : rec.from, title: subject ?? rec.branch, body: prBody(rec.message) });
      const next = { number: r.pull.number, url: r.pull.url, existing: r.existing };
      setPr(next);
      setPrError(null);
      saveLastShip({ ...rec, pr: next, prError: null });
    } catch (e) {
      setPrError(e instanceof AppError ? e.message || describeError(e).title : "Couldn't open the pull request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section role="status" className="rounded-lg border border-primary/40 bg-primary/5 p-3" data-testid="ship-result">
      <div className="flex items-start gap-2.5">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="font-semibold">
            {`Pushed to ${rec.branch}`}
          </p>
          <p className="break-words text-muted-foreground">
            <span className="font-mono text-[12px]">{short(rec.sha)}</span> · {subject} · {rec.files} file{rec.files === 1 ? "" : "s"}
          </p>
          {rec.created ? <p className="text-xs text-muted-foreground">New branch from {rec.from}. You're now working on it; {rec.from} is unchanged.</p> : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Dismiss" className="-m-2 grid size-10 place-items-center text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      {rec.url || pr ? (
        <div className="mt-3 flex flex-wrap gap-2 pl-7">
          {rec.url ? (
            <Button asChild variant="secondary" size="sm">
              <a href={rec.url} target="_blank" rel="noreferrer noopener" data-testid="link-commit">
                <GitCommitHorizontal className="size-4" aria-hidden /> View commit
              </a>
            </Button>
          ) : null}
          {pr ? (
            <Button asChild size="sm">
              <a href={pr.url} target="_blank" rel="noreferrer noopener" data-testid="link-pull-request">
                <GitPullRequest className="size-4" aria-hidden /> {pr.existing ? "Updated" : "Opened"} PR #{pr.number}
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
      {prError ? (
        <div className="mt-2 space-y-2 pl-7 text-xs" role="alert">
          <p className="text-danger">The commit is pushed, but the pull request wasn't opened: {prError}</p>
          <Button variant="secondary" size="sm" onClick={retryPr} disabled={busy} data-testid="button-retry-pr">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <GitPullRequest className="size-4" aria-hidden />} Try again
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** Branch status: last commit result, open PR for this branch, recent commits. */
export function GitStatus({ target, version, compact = false }: { target: GitTarget; version: number; compact?: boolean }) {
  const { owner, repo, branch, defaultBranch } = target;
  const [rec, setRec] = useState(() => {
    const r = loadLastShip(owner, repo);
    return r && (r.branch === branch || r.from === branch) ? r : null;
  });
  const commits = useAsync(() => githubApi.commits(owner, repo, branch), [owner, repo, branch, version]);
  const pulls = useAsync(
    () => (branch === defaultBranch ? Promise.resolve({ pulls: [] }) : githubApi.pulls(owner, repo, branch)),
    [owner, repo, branch, defaultBranch, version],
  );
  const [prBusy, setPrBusy] = useState(false);
  const [prErr, setPrErr] = useState<string | null>(null);

  async function openPr() {
    setPrBusy(true);
    setPrErr(null);
    try {
      const last = commits.status === "success" ? commits.data.commits[0]?.message : undefined;
      await githubApi.createPull(owner, repo, { head: branch, base: defaultBranch, title: last ?? branch, body: "Opened from Chrono. Review the diff before merging." });
      pulls.retry();
    } catch (e) {
      setPrErr(e instanceof AppError ? e.message || describeError(e).title : "Couldn't open the pull request.");
    } finally {
      setPrBusy(false);
    }
  }

  const openPull = pulls.status === "success" ? pulls.data.pulls[0] : undefined;

  return (
    <div className="space-y-4">
      {rec && !compact ? (
        <ShipResult
          rec={rec}
          target={target}
          onClose={() => {
            clearLastShip(owner, repo);
            setRec(null);
          }}
        />
      ) : null}

      {branch !== defaultBranch ? (
        <section className="rounded-lg border bg-surface p-3 text-sm" aria-label="Pull request" data-testid="pr-status">
          {pulls.status === "loading" ? (
            <Skeleton className="h-6 w-2/3" />
          ) : openPull ? (
            <a href={openPull.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-2.5 hover:underline">
              <GitPullRequest className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                PR #{openPull.number} · {openPull.title}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{openPull.draft ? "draft" : "open"} → {openPull.base}</span>
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </a>
          ) : (
            <div className="flex items-center gap-2.5">
              <GitPullRequest className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 text-muted-foreground">No open pull request from {branch}.</span>
              {target.canPush ? (
                <Button variant="secondary" size="sm" onClick={openPr} disabled={prBusy} data-testid="button-open-pr">
                  {prBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Open PR
                </Button>
              ) : null}
            </div>
          )}
          {prErr ? <p className="mt-2 text-xs text-danger" role="alert">{prErr}</p> : null}
        </section>
      ) : null}

      <section aria-labelledby="commits-title" className="overflow-hidden rounded-lg border bg-surface">
        <h2 id="commits-title" className="border-b px-3 py-2.5 text-sm font-semibold">
          Recent commits on <span className="font-mono text-[13px]">{branch}</span>
        </h2>
        {commits.status === "loading" ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-5" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        ) : commits.status === "error" ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Couldn't load commits ({describeError(commits.error).title.toLowerCase()}).{" "}
            <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={commits.retry}>
              Retry
            </button>
          </p>
        ) : (
          <ul className="divide-y" data-testid="list-commits">
            {commits.data.commits.slice(0, compact ? 3 : undefined).map((c) => (
              <li key={c.sha}>
                <a href={c.url} target="_blank" rel="noreferrer noopener" className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2">
                  <span className="font-mono text-[12px] text-muted-foreground">{short(c.sha)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.message}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {c.author} · {ago(c.date)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
