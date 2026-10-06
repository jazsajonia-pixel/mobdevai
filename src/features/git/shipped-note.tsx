import { GitCommitHorizontal, GitPullRequest } from "lucide-react";
import type { ShippedInfo } from "@/features/agent/task";

/** Compact commit/PR line for an AI task whose changes were committed. */
export function ShippedNote({
  info,
  compact = false,
}: {
  info: ShippedInfo;
  compact?: boolean;
}) {
  const short = info.sha.slice(0, 7);
  if (compact) {
    return (
      <span
        className="shrink-0 text-xs font-medium text-success"
        data-testid="text-task-shipped"
      >
        {info.pr ? `PR #${info.pr.number}` : `Committed ${short}`}
      </span>
    );
  }
  return (
    <div
      className="rounded-lg border bg-surface px-3 py-2.5 text-sm"
      data-testid="task-shipped"
    >
      <p className="flex items-center gap-2 font-medium">
        <GitCommitHorizontal className="size-4 text-success" aria-hidden />
        Committed and pushed
      </p>
      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
        {short} on {info.branch}
      </p>
      {info.url || info.pr ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {info.url ? (
            <a
              href={info.url}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              View commit
            </a>
          ) : null}
          {info.pr ? (
            <a
              href={info.pr.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
            >
              <GitPullRequest className="size-3" aria-hidden /> PR #
              {info.pr.number}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
