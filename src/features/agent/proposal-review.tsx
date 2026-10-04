import { Link } from "wouter";
import { MonitorPlay } from "lucide-react";
import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, FileDiff as FileDiffIcon, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/dialogs";
import { DiffView } from "@/features/git/diff-view";
import { diffChange } from "@/features/git/diff";
import { cn } from "@/lib/utils";
import { proposalFiles, statusOf, type Proposal, type ProposedFile } from "./proposal";

const LETTER = { added: "A", modified: "M", deleted: "D" } as const;
const LETTER_CLS = { added: "text-primary", modified: "text-warning", deleted: "text-danger" } as const;

export function toDiff(f: ProposedFile) {
  const status = statusOf(f);
  return diffChange({ path: f.path, status, content: f.after ?? undefined, base: f.before ?? undefined });
}

function counts(f: ProposedFile) {
  const d = toDiff(f);
  return { added: d.added, removed: d.removed };
}

interface ReviewActions {
  onAccept: (paths: string[]) => Promise<void>;
  onReject: (paths: string[]) => void;
  conflictsFor: (files: ProposedFile[]) => Promise<string[]>;
}

/** Inline summary of the task's proposed changes. */
export function ProposalSummary({ proposal, onReview, previewHref }: { proposal: Proposal; onReview: () => void; previewHref?: string }) {
  const files = proposalFiles(proposal);
  if (!files.length) return null;
  const pending = files.filter((f) => f.decision === "pending").length;
  return (
    <section className="rounded-lg border bg-surface" aria-label="Proposed changes" data-testid="card-proposal">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <FileDiffIcon className="size-4 text-primary" aria-hidden />
        <h3 className="flex-1 text-sm font-semibold">
          Proposed changes · {files.length} file{files.length === 1 ? "" : "s"}
        </h3>
        {pending ? <span className="text-xs font-medium text-warning">{pending} to review</span> : <span className="text-xs text-muted-foreground">Reviewed</span>}
      </div>
      <ul className="divide-y">
        {files.map((f) => {
          const st = statusOf(f);
          const c = counts(f);
          return (
            <li key={f.path} className="flex min-h-11 items-center gap-2 px-4 py-2 text-xs">
              <span className={cn("w-3 shrink-0 font-mono font-bold", LETTER_CLS[st])}>{LETTER[st]}</span>
              <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
              <span className="shrink-0 font-mono text-muted-foreground tabular">
                +{c.added} −{c.removed}
              </span>
              <span className={cn("w-16 shrink-0 text-right", f.decision === "accepted" ? "text-primary" : f.decision === "rejected" ? "text-muted-foreground line-through" : "text-warning")}>
                {f.decision === "pending" ? "pending" : f.decision}
              </span>
            </li>
          );
        })}
      </ul>
      {pending ? (
        <div className="p-3">
          <Button className="w-full" onClick={onReview} data-testid="button-review-changes">
            Review {pending} change{pending === 1 ? "" : "s"}
          </Button>
        </div>
      ) : previewHref && files.some((f) => f.decision === "accepted") ? (
        <div className="p-3">
          <Button asChild variant="secondary" className="w-full">
            <Link href={previewHref} data-testid="link-preview-changes">
              <MonitorPlay className="size-4" aria-hidden /> Preview changes
            </Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** Full-height review sheet: diff per file, accept / reject per file or all. */
export function ReviewSheet({ open, onOpenChange, proposal, isDemo, ...actions }: { open: boolean; onOpenChange: (o: boolean) => void; proposal: Proposal; isDemo: boolean } & ReviewActions) {
  const files = useMemo(() => proposalFiles(proposal).filter((f) => f.decision === "pending"), [proposal]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ paths: string[]; deletions: string[]; conflicts: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = expanded ?? files[0]?.path ?? null;

  async function requestAccept(paths: string[]) {
    const sel = files.filter((f) => paths.includes(f.path));
    const deletions = sel.filter((f) => f.after === null).map((f) => f.path);
    const conflicts = await actions.conflictsFor(sel);
    if (deletions.length || conflicts.length) setConfirm({ paths, deletions, conflicts });
    else await doAccept(paths);
  }

  async function doAccept(paths: string[]) {
    setBusy(true);
    try {
      await actions.onAccept(paths);
    } finally {
      setBusy(false);
    }
    if (files.length <= paths.length) onOpenChange(false);
  }

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title="Review proposed changes"
        description={`Accepted files are saved to your workspace${isDemo ? " (demo — nothing leaves this device)" : ". Nothing is committed or pushed to GitHub."}`}
      >
        {files.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Everything has been reviewed.</p>
        ) : (
          <div className="space-y-3">
            {files.map((f) => {
              const st = statusOf(f);
              const c = counts(f);
              const isOpen = shown === f.path;
              return (
                <article key={f.path} className="overflow-hidden rounded-lg border" data-testid={`review-file-${f.path}`}>
                  <button type="button" onClick={() => setExpanded(isOpen ? "" : f.path)} aria-expanded={isOpen} className="flex min-h-11 w-full items-center gap-2 bg-surface-2 px-3 py-2 text-left text-xs">
                    <span className={cn("w-3 shrink-0 font-mono font-bold", LETTER_CLS[st])}>{LETTER[st]}</span>
                    <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">
                      +{c.added} −{c.removed}
                    </span>
                    <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {f.renamedFrom ? <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">Renamed from {f.renamedFrom}</p> : null}
                  {f.after === null ? (
                    <p className="flex gap-1.5 border-t bg-danger/5 px-3 py-2 text-xs text-danger">
                      <AlertTriangle className="size-3.5 shrink-0" /> Deletes this file{f.reason ? ` — ${f.reason}` : ""}
                    </p>
                  ) : null}
                  {isOpen ? (
                    <div className="max-h-[45dvh] overflow-auto border-t">
                      <DiffView diff={toDiff(f)} />
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 border-t p-2">
                    <Button variant="ghost" size="sm" onClick={() => actions.onReject([f.path])} disabled={busy} data-testid="button-reject-file">
                      <X /> Reject
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void requestAccept([f.path])} disabled={busy} data-testid="button-accept-file">
                      <Check /> Accept
                    </Button>
                  </div>
                </article>
              );
            })}
            <div className="sticky bottom-0 grid grid-cols-2 gap-2 bg-surface pt-2">
              <Button variant="secondary" onClick={() => actions.onReject(files.map((f) => f.path))} disabled={busy} data-testid="button-reject-all">
                Reject all
              </Button>
              <Button onClick={() => void requestAccept(files.map((f) => f.path))} disabled={busy} data-testid="button-accept-all">
                <Check /> Accept all ({files.length})
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      <ConfirmSheet
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Apply these changes?"
        confirmLabel="Apply"
        danger={!!confirm?.deletions.length}
        onConfirm={async () => {
          if (confirm) await doAccept(confirm.paths);
        }}
      >
        <div className="space-y-2 text-sm" data-testid="confirm-apply">
          {confirm?.deletions.length ? (
            <p className="text-danger">
              Deletes {confirm.deletions.length} file{confirm.deletions.length === 1 ? "" : "s"}: <span className="font-mono text-xs">{confirm.deletions.join(", ")}</span>
            </p>
          ) : null}
          {confirm?.conflicts.length ? (
            <p className="text-warning">
              Changed since the agent read {confirm.conflicts.length === 1 ? "it" : "them"} — applying overwrites your edits in <span className="font-mono text-xs">{confirm.conflicts.join(", ")}</span>.
            </p>
          ) : null}
          <p className="text-muted-foreground">You can still discard changes in the Git tab afterwards.</p>
        </div>
      </ConfirmSheet>
    </>
  );
}
