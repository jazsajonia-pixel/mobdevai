import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, FilePen, RotateCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/dialogs";
import { EmptyState } from "@/components/states";
import { PhaseBoundary } from "@/components/phase-boundary";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/features/workspace/context";
import type { FileChange } from "@/features/workspace/model";
import { diffChange } from "./diff";
import { DiffView } from "./diff-view";

const STATUS: Record<FileChange["status"], { letter: string; cls: string; label: string }> = {
  added: { letter: "A", cls: "text-[hsl(var(--diff-add))] bg-[hsl(var(--diff-add)/0.12)]", label: "Added" },
  modified: { letter: "M", cls: "text-warning bg-warning/10", label: "Modified" },
  deleted: { letter: "D", cls: "text-[hsl(var(--diff-del))] bg-[hsl(var(--diff-del)/0.12)]", label: "Deleted" },
};

function ChangeRow({ change, onDiscard, onOpen }: { change: FileChange; onDiscard: () => void; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const diff = useMemo(() => diffChange(change), [change]);
  const s = STATUS[change.status];
  return (
    <li className="border-b last:border-0" data-testid={`change-${change.path}`}>
      <div className="flex items-center">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 pl-3 text-left">
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
          <span className={cn("grid size-5 shrink-0 place-items-center rounded font-mono text-[11px] font-bold", s.cls)} aria-label={s.label}>{s.letter}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{change.path}</span>
          <span className="shrink-0 font-mono text-[11px] tabular">
            <span className="text-[hsl(var(--diff-add))]">+{diff.added}</span> <span className="text-[hsl(var(--diff-del))]">−{diff.removed}</span>
          </span>
        </button>
        {onOpen ? (
          <button type="button" onClick={onOpen} aria-label={`Edit ${change.path}`} className="grid size-11 shrink-0 place-items-center text-muted-foreground hover:text-foreground">
            <FilePen className="size-4" />
          </button>
        ) : null}
        <button type="button" onClick={onDiscard} aria-label={`Discard changes to ${change.path}`} data-testid={`button-discard-${change.path}`} className="grid size-11 shrink-0 place-items-center text-muted-foreground hover:text-danger">
          <RotateCcw className="size-4" />
        </button>
      </div>
      {open ? <div className="border-t bg-background">{<DiffView diff={diff} />}</div> : null}
    </li>
  );
}

/** Git tab: review local changes as diffs, discard per file or all. Commit/push lands in Phase 6. */
export function ChangesPanel({ branch, isDemo, canPush, onEdit }: { branch: string; isDemo: boolean; canPush: boolean; onEdit: (path: string) => void }) {
  const ws = useWorkspace();
  const [discard, setDiscard] = useState<string | "all" | null>(null);
  const drafts = Object.keys(ws.data.drafts);
  const totals = useMemo(() => {
    let a = 0;
    let r = 0;
    for (const c of ws.changes) {
      const d = diffChange(c);
      a += d.added;
      r += d.removed;
    }
    return { a, r };
  }, [ws.changes]);

  return (
    <div className="space-y-4 p-4">
      {ws.baseMoved ? (
        <div role="note" className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-muted-foreground"><span className="font-semibold text-foreground">{branch} moved on GitHub.</span> Your changes were made on an older commit. They're kept; conflicts are checked before committing.</p>
        </div>
      ) : null}
      {!ws.storageOk ? (
        <div role="alert" className="flex gap-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <p className="text-muted-foreground"><span className="font-semibold text-foreground">Changes aren't being saved on this device.</span> Browser storage is full or disabled — don't close this tab.</p>
        </div>
      ) : null}

      {ws.changes.length === 0 ? (
        <div className="rounded-lg border bg-surface">
          <EmptyState title="Working tree clean" className="py-8">
            {isDemo ? "Edit a demo file and its diff appears here. Nothing is ever sent to GitHub." : `On ${branch}. Edit a file and save it to see the diff here.`}
          </EmptyState>
        </div>
      ) : (
        <section aria-labelledby="changes-title" className="overflow-hidden rounded-lg border bg-surface">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <h2 id="changes-title" className="text-sm font-semibold">
              {ws.changes.length} changed file{ws.changes.length === 1 ? "" : "s"}
            </h2>
            <span className="font-mono text-[11px] tabular">
              <span className="text-[hsl(var(--diff-add))]">+{totals.a}</span> <span className="text-[hsl(var(--diff-del))]">−{totals.r}</span>
            </span>
            <Button variant="ghost" size="sm" className="ml-auto text-danger" onClick={() => setDiscard("all")} data-testid="button-discard-all">
              Discard all
            </Button>
          </div>
          <ul>
            {ws.changes.map((c) => (
              <ChangeRow key={c.path} change={c} onDiscard={() => setDiscard(c.path)} onOpen={c.status === "deleted" ? undefined : () => onEdit(c.path)} />
            ))}
          </ul>
        </section>
      )}

      {drafts.length ? (
        <p className="flex items-center gap-2 rounded-md border bg-surface px-3 py-2.5 text-xs text-muted-foreground" data-testid="text-unsaved">
          <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
          {drafts.length} file{drafts.length === 1 ? " has" : "s have"} unsaved edits — save in the editor to include {drafts.length === 1 ? "it" : "them"} here.
        </p>
      ) : null}

      {!isDemo && !canPush ? (
        <div role="note" className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            <span className="font-semibold">Read-only access.</span>{" "}
            <span className="text-muted-foreground">You can edit here, but can't push to this repository. Fork it on GitHub to ship changes.</span>
          </p>
        </div>
      ) : null}

      <PhaseBoundary
        phase={6}
        title="Branch, commit, push, PR"
        description="AI changes go to a working branch named ai/mobile-development-ai/<task>, never silently to the default branch."
        planned={["Generated, editable commit message", "Push and open a pull request", "Destructive operations require confirmation"]}
      />

      <ConfirmSheet
        open={discard !== null}
        onOpenChange={(o) => !o && setDiscard(null)}
        title={discard === "all" ? `Discard all ${ws.changes.length} changes?` : "Discard changes?"}
        description={discard === "all" ? "Every file goes back to the branch, including unsaved edits. New files are removed. This can't be undone." : `${discard ?? ""} goes back to its content on the branch. This can't be undone.`}
        confirmLabel="Discard"
        onConfirm={() => {
          if (discard === "all") ws.revertAll();
          else if (discard) ws.revert(discard);
        }}
      />
    </div>
  );
}
