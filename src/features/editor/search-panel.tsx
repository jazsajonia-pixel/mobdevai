import { useMemo, useState } from "react";
import { ChevronLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/features/workspace/context";
import { buildMatcher, searchContent, type FileMatches } from "./project-search";

const LOAD_LIMIT = 300;
const MAX_FILE_BYTES = 256 * 1024;
const SKIP = /\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|woff2?|ttf|otf|eot|mp[34]|mov|lock)$|(^|\/)(node_modules|dist|build|\.next)\//i;

/**
 * Search across files. Searches everything already on the device (edited, opened, cached);
 * "Load files" fetches the remaining text files from GitHub (capped) so the search is complete.
 */
export function SearchPanel({ onBack, onOpen }: { onBack: () => void; onOpen: (path: string, line: number) => void }) {
  const ws = useWorkspace();
  const [query, setQuery] = useState("");
  const [caseSensitive, setCase] = useState(false);
  const [regexp, setRegexp] = useState(false);
  const [loading, setLoading] = useState<{ done: number; total: number } | null>(null);
  const [version, setVersion] = useState(0);

  const candidates = useMemo(
    () => ws.paths.filter((p) => !SKIP.test(p) && (ws.source.baseSizes?.get(p) ?? 0) <= MAX_FILE_BYTES),
    [ws.paths, ws.source.baseSizes],
  );
  const re = buildMatcher(query, { caseSensitive, regexp });

  const { results, searched } = useMemo(() => {
    if (!re) return { results: [] as FileMatches[], searched: 0 };
    const out: FileMatches[] = [];
    let n = 0;
    for (const p of candidates) {
      const content = ws.peekBuffer(p);
      if (content === undefined) continue;
      n++;
      const hit = searchContent(p, content, re);
      if (hit) out.push(hit);
    }
    return { results: out, searched: n };
    // `version` re-runs after loading files; data covers edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, regexp, candidates, ws.data, version]);

  const notLoaded = candidates.filter((p) => ws.peekBuffer(p) === undefined);

  const loadAll = async () => {
    const queue = notLoaded.slice(0, LOAD_LIMIT);
    setLoading({ done: 0, total: queue.length });
    let done = 0;
    const worker = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        await ws.getBase(p).catch(() => null); // binary / too large files are simply skipped
        done++;
        if (done % 10 === 0) setLoading({ done, total: done + queue.length });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setLoading(null);
    setVersion((v) => v + 1);
  };

  const total = results.reduce((n, r) => n + r.matches.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-2 pb-2 pt-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-search-back" className="-ml-1 shrink-0">
            <ChevronLeft /> Files
          </Button>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in files"
            aria-label="Search in files"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-testid="input-project-search"
            className={cn("h-10 min-w-0 flex-1 rounded-md border bg-surface px-3 font-mono text-base sm:text-sm", query && !re && "border-danger")}
          />
        </div>
        <div className="mt-1.5 flex items-center gap-1 pl-1">
          {[
            { on: caseSensitive, set: setCase, label: "Match case", text: "Aa" },
            { on: regexp, set: setRegexp, label: "Regular expression", text: ".*" },
          ].map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={t.on}
              aria-label={t.label}
              onClick={() => t.set((v: boolean) => !v)}
              className={cn("grid h-8 min-w-9 place-items-center rounded-md px-1.5 font-mono text-xs", t.on ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-surface-2")}
            >
              {t.text}
            </button>
          ))}
          <span className="ml-auto pr-1 text-xs tabular text-muted-foreground" aria-live="polite" data-testid="text-search-summary">
            {re ? `${total} result${total === 1 ? "" : "s"} in ${results.length} file${results.length === 1 ? "" : "s"}` : ""}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {notLoaded.length > 0 ? (
          <div className="m-3 flex items-center gap-3 rounded-md border bg-surface p-3 text-xs text-muted-foreground">
            <p className="min-w-0 flex-1">
              {loading
                ? `Loading files… ${loading.done}/${loading.total}`
                : `Searching ${searched.toLocaleString()} of ${candidates.length.toLocaleString()} files on this device.`}
            </p>
            <Button size="sm" variant="secondary" disabled={!!loading} onClick={loadAll} data-testid="button-load-all">
              {loading ? <Loader2 className="animate-spin" /> : <Download />}
              Load {Math.min(notLoaded.length, LOAD_LIMIT)}
            </Button>
          </div>
        ) : null}
        {!query ? (
          <EmptyState title="Search across the project" className="py-10">
            Matches in edited files include your unsaved changes.
          </EmptyState>
        ) : !re ? (
          <p className="p-4 text-sm text-danger">Invalid regular expression.</p>
        ) : results.length === 0 ? (
          <EmptyState title="No results" className="py-10" />
        ) : (
          <ul className="pb-6" data-testid="list-search-results">
            {results.map((r) => (
              <li key={r.path} className="border-b last:border-0">
                <p className="sticky top-0 truncate bg-background/95 px-4 pb-1 pt-3 font-mono text-xs font-semibold backdrop-blur">
                  {r.path} <span className="font-normal text-muted-foreground">· {r.matches.length}</span>
                </p>
                <ul>
                  {r.matches.map((m) => (
                    <li key={m.line}>
                      <button type="button" onClick={() => onOpen(r.path, m.line)} className="flex min-h-10 w-full items-baseline gap-3 px-4 py-1.5 text-left hover:bg-surface-2">
                        <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular text-muted-foreground">{m.line}</span>
                        <span className="min-w-0 truncate font-mono text-[12px]">
                          {m.text.slice(0, m.start)}
                          <mark className="rounded-sm bg-warning/30 text-foreground">{m.text.slice(m.start, m.end)}</mark>
                          {m.text.slice(m.end)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
