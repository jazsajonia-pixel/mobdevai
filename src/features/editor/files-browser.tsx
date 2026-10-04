import { useMemo, useState } from "react";
import { AlertTriangle, FilePlus2, Search, TextSearch } from "lucide-react";
import { EmptyState } from "@/components/states";
import { InputSheet } from "@/components/dialogs";
import { FileTree, Mark } from "./file-tree";
import { buildTree } from "@/lib/tree";
import { useWorkspace } from "@/features/workspace/context";
import { useFileMarks } from "@/features/workspace/use-marks";

/** File tree + "Go to file" + New file. Shared by the Files screen and the editor's drawer. */
export function FilesBrowser({ onOpen, onSearch, autoFocus = false }: { onOpen: (path: string) => void; onSearch?: () => void; autoFocus?: boolean }) {
  const ws = useWorkspace();
  const marks = useFileMarks();
  const [filter, setFilter] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const tree = useMemo(() => buildTree(ws.paths.map((path) => ({ path }))), [ws.paths]);
  const needle = filter.trim().toLowerCase();
  const matches = needle ? ws.paths.filter((p) => p.toLowerCase().includes(needle)).slice(0, 200) : null;

  // Suggest creating next to the active file.
  const folder = ws.data.active?.includes("/") ? `${ws.data.active.slice(0, ws.data.active.lastIndexOf("/"))}/` : "";

  return (
    <div>
      <div className="flex gap-2 px-3 pt-3">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Filter files</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={filter}
            autoFocus={autoFocus}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Go to file · ${ws.paths.length.toLocaleString()}`}
            data-testid="input-filter-files"
            className="h-11 w-full rounded-md border bg-surface pl-9 pr-3 font-mono text-base placeholder:font-sans placeholder:text-muted-foreground sm:text-sm"
          />
        </label>
        {onSearch ? (
          <button type="button" onClick={onSearch} aria-label="Search in files" title="Search in files" data-testid="button-search-files" className="grid size-11 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:text-foreground">
            <TextSearch className="size-4" />
          </button>
        ) : null}
        <button type="button" onClick={() => setNewOpen(true)} aria-label="New file" title="New file" data-testid="button-new-file" className="grid size-11 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:text-foreground">
          <FilePlus2 className="size-4" />
        </button>
      </div>
      {ws.source.truncated ? (
        <p role="note" className="mx-3 mt-3 flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          Large repository: GitHub returned a partial file list. Use “Go to file” or open the folder you need.
        </p>
      ) : null}
      {ws.paths.length === 0 ? (
        <EmptyState title="No files on this branch" className="py-10" />
      ) : matches ? (
        matches.length ? (
          <ul className="py-1">
            {matches.map((p) => (
              <li key={p}>
                <button type="button" onClick={() => onOpen(p)} className="flex h-11 w-full items-center px-4 text-left font-mono text-[13px] hover:bg-surface-2">
                  <span className="truncate">{p}</span>
                  <Mark mark={marks.get(p)} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No files match" className="py-8" />
        )
      ) : (
        <FileTree nodes={tree} onOpen={onOpen} marks={marks} active={ws.data.active} />
      )}

      <InputSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        title="New file"
        description="Created in this workspace only. It's sent to GitHub when you commit."
        label="Path"
        initial={folder}
        placeholder="src/components/Button.tsx"
        submitLabel="Create file"
        onSubmit={(value) => {
          const path = ws.create(value);
          onOpen(path);
        }}
      />
    </div>
  );
}
