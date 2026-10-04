import { useMemo, useState } from "react";
import { Check, GitBranch, Lock, Search } from "lucide-react";
import { BottomSheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { BranchListResponse } from "@/types/github";
import type { AsyncState } from "@/hooks/use-async";

export function BranchPicker({
  open,
  onOpenChange,
  branches,
  current,
  defaultBranch,
  onSelect,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: AsyncState<BranchListResponse>;
  current: string;
  defaultBranch: string;
  onSelect: (branch: string) => void;
  onRetry: () => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    if (branches.status !== "success") return [];
    const all = [...branches.data.branches].sort((a, b) =>
      a.name === defaultBranch ? -1 : b.name === defaultBranch ? 1 : a.name.localeCompare(b.name),
    );
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((b) => b.name.toLowerCase().includes(needle)) : all;
  }, [branches, q, defaultBranch]);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Switch branch" description="Files reload from the selected branch.">
      <label className="relative mb-2 block">
        <span className="sr-only">Find a branch</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a branch"
          data-testid="input-branch-search"
          className="h-11 w-full rounded-md border bg-background pl-9 pr-3 font-mono text-base placeholder:font-sans placeholder:text-muted-foreground sm:text-sm"
        />
      </label>

      {branches.status === "loading" ? (
        <div className="space-y-2 py-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : branches.status === "error" ? (
        <ErrorState error={branches.error} onRetry={onRetry} />
      ) : list.length === 0 ? (
        <EmptyState title="No branches match" className="py-6" />
      ) : (
        <ul className="-mx-4" data-testid="list-branches">
          {list.map((b) => (
            <li key={b.name}>
              <button
                type="button"
                onClick={() => onSelect(b.name)}
                data-testid={`branch-${b.name}`}
                className="flex h-12 w-full items-center gap-3 px-4 text-left hover:bg-surface-2"
              >
                <GitBranch className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{b.name}</span>
                {b.name === defaultBranch ? <Badge>default</Badge> : null}
                {b.protected ? <Lock className="size-3.5 text-muted-foreground" aria-label="Protected" /> : null}
                {b.name === current ? <Check className="size-4 text-primary" aria-label="Current branch" /> : <span className="size-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {branches.status === "success" && branches.data.truncated ? (
        <p className="pt-2 text-xs text-muted-foreground">Showing the first 300 branches.</p>
      ) : null}
    </BottomSheet>
  );
}
