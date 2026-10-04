import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from "@codemirror/search";
import { ChevronDown, ChevronUp, Replace, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_COUNT = 999;

function countMatches(view: EditorView, query: SearchQuery): { total: number; current: number } {
  if (!query.valid) return { total: 0, current: 0 };
  const cursor = query.getCursor(view.state);
  const sel = view.state.selection.main;
  let total = 0;
  let current = 0;
  for (let r = cursor.next(); !r.done; r = cursor.next()) {
    total++;
    if (r.value.from === sel.from && r.value.to === sel.to) current = total;
    if (total > MAX_COUNT) break;
  }
  return { total, current };
}

function Toggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("grid h-9 min-w-9 place-items-center rounded-md px-1.5 font-mono text-xs", on ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-surface-2")}
    >
      {children}
    </button>
  );
}

/** Mobile find / replace bar driving @codemirror/search. */
export function FindBar({ view, onClose, readOnly }: { view: () => EditorView | null; onClose: () => void; readOnly?: boolean }) {
  const initial = view() ? getSearchQuery(view()!.state) : null;
  const sel = view()?.state.sliceDoc(view()!.state.selection.main.from, view()!.state.selection.main.to) ?? "";
  const [search, setSearch] = useState(sel && !sel.includes("\n") && sel.length < 200 ? sel : (initial?.search ?? ""));
  const [replace, setReplace] = useState(initial?.replace ?? "");
  const [caseSensitive, setCase] = useState(initial?.caseSensitive ?? false);
  const [regexp, setRegexp] = useState(initial?.regexp ?? false);
  const [wholeWord, setWholeWord] = useState(initial?.wholeWord ?? false);
  const [showReplace, setShowReplace] = useState(false);
  const [count, setCount] = useState({ total: 0, current: 0 });
  const input = useRef<HTMLInputElement>(null);

  const query = new SearchQuery({ search, replace, caseSensitive, regexp, wholeWord });
  const invalidRegex = regexp && search !== "" && !query.valid;

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    const v = view();
    if (v) openSearchPanel(v);
    return () => {
      const v2 = view();
      if (v2) closeSearchPanel(v2);
    };
  }, [view]);

  useEffect(() => {
    const v = view();
    if (!v) return;
    v.dispatch({ effects: setSearchQuery.of(query) });
    setCount(countMatches(v, query));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, replace, caseSensitive, regexp, wholeWord]);

  const run = (cmd: (v: EditorView) => boolean) => {
    const v = view();
    if (!v || !query.valid) return;
    cmd(v);
    setCount(countMatches(v, query));
  };

  const label = !search ? "" : invalidRegex ? "Bad regex" : count.total === 0 ? "No results" : `${count.current || "–"}/${count.total > MAX_COUNT ? `${MAX_COUNT}+` : count.total}`;

  return (
    <div className="border-b bg-surface px-2 py-2" role="search" aria-label="Find in file" data-testid="find-bar">
      <div className="flex items-center gap-1">
        {!readOnly ? (
          <button
            type="button"
            onClick={() => setShowReplace((s) => !s)}
            aria-label={showReplace ? "Hide replace" : "Show replace"}
            aria-expanded={showReplace}
            className={cn("grid size-9 shrink-0 place-items-center rounded-md hover:bg-surface-2", showReplace ? "text-primary" : "text-muted-foreground")}
          >
            <Replace className="size-4" />
          </button>
        ) : null}
        <div className="relative min-w-0 flex-1">
          <input
            ref={input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                run(e.shiftKey ? findPrevious : findNext);
              } else if (e.key === "Escape") onClose();
            }}
            placeholder="Find"
            aria-label="Find"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-testid="input-find"
            className={cn("h-9 w-full rounded-md border bg-background pl-2.5 pr-16 font-mono text-base sm:text-sm", invalidRegex && "border-danger")}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] tabular text-muted-foreground" aria-live="polite" data-testid="text-find-count">
            {label}
          </span>
        </div>
        <button type="button" aria-label="Previous match" onClick={() => run(findPrevious)} className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-2">
          <ChevronUp className="size-4" />
        </button>
        <button type="button" aria-label="Next match" onClick={() => run(findNext)} data-testid="button-find-next" className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-2">
          <ChevronDown className="size-4" />
        </button>
        <button type="button" aria-label="Close find" onClick={onClose} data-testid="button-close-find" className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-2">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1 pl-10">
        <Toggle on={caseSensitive} onClick={() => setCase((v) => !v)} label="Match case">Aa</Toggle>
        <Toggle on={wholeWord} onClick={() => setWholeWord((v) => !v)} label="Whole word">ab</Toggle>
        <Toggle on={regexp} onClick={() => setRegexp((v) => !v)} label="Regular expression">.*</Toggle>
      </div>
      {showReplace && !readOnly ? (
        <div className="mt-1.5 flex items-center gap-1 pl-10">
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                run(replaceNext);
              }
            }}
            placeholder="Replace"
            aria-label="Replace with"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-testid="input-replace"
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2.5 font-mono text-base sm:text-sm"
          />
          <button type="button" onClick={() => run(replaceNext)} disabled={!count.total} data-testid="button-replace" className="h-9 shrink-0 rounded-md px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-40">
            Replace
          </button>
          <button type="button" onClick={() => run(replaceAll)} disabled={!count.total} data-testid="button-replace-all" className="h-9 shrink-0 rounded-md px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-40">
            All
          </button>
        </div>
      ) : null}
    </div>
  );
}
