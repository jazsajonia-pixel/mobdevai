import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { FileTree } from "./file-tree";
import { CodeViewer } from "./code-viewer";
import { buildTree } from "@/lib/tree";
import { describeError } from "@/lib/errors";
import type { WorkspaceFile } from "@/types/workspace";

type FileState = { status: "loading" } | { status: "ready"; file: WorkspaceFile } | { status: "error"; error: unknown };

/**
 * File browser + read-only viewer, independent of where files come from (demo bundle or GitHub).
 * Loaded files are cached per `cacheKey` (repo@branch) so going back and forth is instant.
 */
export function FilesPanel({
  paths,
  loadFile,
  cacheKey,
  truncated = false,
  githubUrl,
}: {
  paths: string[];
  loadFile: (path: string) => Promise<WorkspaceFile>;
  cacheKey: string;
  truncated?: boolean;
  githubUrl?: (path: string) => string;
}) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [fileState, setFileState] = useState<FileState>({ status: "loading" });
  const cache = useRef(new Map<string, WorkspaceFile>());
  const current = useRef<string | null>(null);

  useEffect(() => {
    cache.current.clear();
    current.current = null;
    setOpenPath(null);
  }, [cacheKey]);

  const tree = useMemo(() => buildTree(paths.map((path) => ({ path }))), [paths]);
  const needle = filter.trim().toLowerCase();
  const matches = needle ? paths.filter((p) => p.toLowerCase().includes(needle)).slice(0, 200) : null;

  const open = useCallback(
    (path: string) => {
      current.current = path;
      setOpenPath(path);
      const hit = cache.current.get(path);
      if (hit) return setFileState({ status: "ready", file: hit });
      setFileState({ status: "loading" });
      loadFile(path).then(
        (file) => {
          cache.current.set(path, file);
          if (current.current === path) setFileState({ status: "ready", file });
        },
        (error: unknown) => {
          if (current.current === path) setFileState({ status: "error", error });
        },
      );
    },
    [loadFile],
  );

  if (openPath) {
    return (
      <div className="px-3 pt-2">
        <div className="mb-2 flex items-center gap-1">
          <Button variant="ghost" size="sm" className="-ml-1" onClick={() => {
              current.current = null;
              setOpenPath(null);
            }}
            data-testid="button-back-files">
            <ChevronLeft /> Files
          </Button>
          <p className="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground" data-testid="text-open-path">
            {openPath}
          </p>
        </div>
        {fileState.status === "loading" ? (
          <div className="space-y-2 rounded-lg border bg-surface p-3" aria-label="Loading file">
            {[70, 90, 55, 80, 40, 65].map((w, i) => (
              <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : fileState.status === "error" ? (
          <div className="space-y-3">
            <ErrorState
              error={fileState.error}
              onRetry={["BINARY_FILE", "FILE_TOO_LARGE", "NOT_FOUND"].includes(describeError(fileState.error).code) ? undefined : () => open(openPath)}
            />
            {githubUrl ? (
              <Button asChild variant="secondary" className="w-full">
                <a href={githubUrl(openPath)} target="_blank" rel="noreferrer noopener">
                  <ExternalLink /> View on GitHub
                </a>
              </Button>
            ) : null}
          </div>
        ) : (
          <CodeViewer file={fileState.file} />
        )}
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
            placeholder={`Go to file · ${paths.length.toLocaleString()} files`}
            data-testid="input-filter-files"
            className="h-11 w-full rounded-md border bg-surface pl-9 pr-3 font-mono text-base placeholder:font-sans placeholder:text-muted-foreground sm:text-sm"
          />
        </label>
      </div>
      {truncated ? (
        <p role="note" className="mx-3 mt-3 flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          Large repository: GitHub returned a partial file list. Use “Go to file” or open the folder you need.
        </p>
      ) : null}
      {paths.length === 0 ? (
        <EmptyState title="No files on this branch" className="py-10" />
      ) : matches ? (
        matches.length ? (
          <ul className="py-1">
            {matches.map((p) => (
              <li key={p}>
                <button type="button" onClick={() => open(p)} className="flex h-11 w-full items-center px-4 text-left font-mono text-[13px] hover:bg-surface-2">
                  <span className="truncate">{p}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No files match" className="py-8" />
        )
      ) : (
        <FileTree nodes={tree} onOpen={open} />
      )}
    </div>
  );
}
