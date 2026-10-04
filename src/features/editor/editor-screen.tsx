import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import {
  ExternalLink,
  FileDiff,
  FolderTree,
  MoreHorizontal,
  PenLine,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Undo2,
  WrapText,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/sheet";
import { ConfirmSheet, InputSheet } from "@/components/dialogs";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { describeError } from "@/lib/errors";
import { languageFromPath } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { safeStorage } from "@/lib/storage";
import { useWorkspace } from "@/features/workspace/context";
import { useFileMarks } from "@/features/workspace/use-marks";
import { CodeEditor, type CodeEditorHandle, type HistoryInfo } from "./code-editor";
import { FindBar } from "./find-bar";
import { FilesBrowser } from "./files-browser";
import { Mark } from "./file-tree";

type Load = { path: string; status: "loading" } | { path: string; status: "ready"; doc: string } | { path: string; status: "error"; error: unknown };

const SYMBOLS: { label: string; insert: string; aria?: string }[] = [
  { label: "⇥", insert: "  ", aria: "Indent" },
  { label: "{", insert: "{" },
  { label: "}", insert: "}" },
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: "[", insert: "[" },
  { label: "]", insert: "]" },
  { label: "<", insert: "<" },
  { label: ">", insert: ">" },
  { label: "=", insert: "=" },
  { label: ";", insert: ";" },
  { label: ":", insert: ":" },
  { label: '"', insert: '"' },
  { label: "'", insert: "'" },
  { label: "`", insert: "`" },
  { label: "/", insert: "/" },
  { label: "|", insert: "|" },
  { label: "&", insert: "&" },
  { label: "$", insert: "$" },
];

const WRAP_KEY = "editor:wrap";
const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);

function ActionButton({ label, onClick, disabled, children, testId, primary }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; testId: string; primary?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        "flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium disabled:opacity-35",
        primary ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

/**
 * The mobile editor: open-file tabs, CodeMirror, find/replace, symbol bar, and a thumb-reachable
 * action bar (undo · redo · find · save · more). Saving writes to the local workspace — nothing
 * goes to GitHub until a commit (Phase 6).
 */
export function EditorScreen({ onOpenSearch, gitHref }: { onOpenSearch: () => void; gitHref: string }) {
  const ws = useWorkspace();
  const marks = useFileMarks();
  const [, navigate] = useLocation();
  const active = ws.data.active;
  const editor = useRef<CodeEditorHandle>(null);
  const [load, setLoad] = useState<Load | null>(null);
  const [historyInfo, setHistory] = useState<HistoryInfo>({ canUndo: false, canRedo: false });
  const [findOpen, setFindOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [wrap, setWrap] = useState(() => safeStorage.get(WRAP_KEY) !== "0");
  const [sheet, setSheet] = useState<null | "more" | "rename" | "delete" | "discard" | "close" | "drawer">(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Load the active file's buffer (draft → saved → base) unless its editor state is cached.
  useEffect(() => {
    if (!active) {
      setLoad(null);
      return;
    }
    if (ws.editorStates.has(active)) {
      setLoad({ path: active, status: "ready", doc: "" });
      return;
    }
    let cancelled = false;
    setLoad({ path: active, status: "loading" });
    ws.getBuffer(active).then(
      (doc) => !cancelled && setLoad({ path: active, status: "ready", doc }),
      (error: unknown) => !cancelled && setLoad({ path: active, status: "error", error }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ws.editorStates.has(active ?? "")]);

  // Debounced draft tracking (dirty dot + crash protection).
  const pending = useRef<{ path: string; doc: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const flushDraft = useCallback(() => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) ws.updateDraft(p.path, p.doc);
  }, [ws]);
  useEffect(() => () => flushDraft(), [flushDraft]);

  const onChange = useCallback(
    (doc: string) => {
      if (!active) return;
      if (pending.current && pending.current.path !== active) flushDraft();
      pending.current = { path: active, doc };
      clearTimeout(timer.current);
      timer.current = setTimeout(flushDraft, 200);
    },
    [active, flushDraft],
  );

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  };

  const save = useCallback(async () => {
    if (!active || load?.status !== "ready") return;
    clearTimeout(timer.current);
    pending.current = null;
    setSaving(true);
    try {
      await ws.save(active, editor.current?.getDoc() ?? "");
      flash("Saved to workspace");
    } finally {
      setSaving(false);
    }
  }, [active, load?.status, ws]);

  // Jump to a line (from project search).
  useEffect(() => {
    if (ws.jump && load?.status === "ready" && ws.jump.path === load.path) {
      const line = ws.jump.line;
      requestAnimationFrame(() => editor.current?.gotoLine(line));
    }
  }, [ws.jump, load]);

  // Keep the active tab visible.
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active]);

  const getView = useCallback(() => editor.current?.view() ?? null, []);
  const closeFind = useCallback(() => setFindOpen(false), []);
  const onHistory = useCallback((h: HistoryInfo) => {
    setHistory((prev) => (prev.canUndo === h.canUndo && prev.canRedo === h.canRedo ? prev : h));
  }, []);

  const onFocusChange = useCallback((f: boolean) => {
    setFocused(f);
    document.documentElement.classList.toggle("editor-focused", f);
  }, []);
  useEffect(() => () => document.documentElement.classList.remove("editor-focused"), []);

  const requestClose = (path: string) => {
    if (path === active) flushDraft();
    if (path in ws.data.drafts || (path === active && pending.current)) {
      setClosing(path);
      setSheet("close");
    } else ws.closeFile(path);
  };

  const dirty = !!active && (active in ws.data.drafts);
  const change = active ? ws.data.changes[active] : undefined;
  const ready = load?.status === "ready" && load.path === active;

  if (!active) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tabs */}
      <div className="flex shrink-0 items-stretch border-b bg-surface">
        <button type="button" onClick={() => setSheet("drawer")} aria-label="Show files" data-testid="button-show-tree" className="grid w-11 shrink-0 place-items-center border-r text-muted-foreground hover:text-foreground">
          <FolderTree className="size-4" />
        </button>
        <div ref={tabsRef} role="tablist" aria-label="Open files" className="scrollbar-none flex min-w-0 flex-1 overflow-x-auto">
          {ws.data.tabs.map((t) => {
            const sel = t === active;
            return (
              <div key={t} className={cn("group flex h-11 max-w-[11rem] shrink-0 items-center border-r", sel ? "bg-background" : "text-muted-foreground")}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={sel}
                  title={t}
                  onClick={() => {
                    flushDraft();
                    ws.openFile(t);
                  }}
                  data-testid={`tab-file-${t}`}
                  className={cn("flex h-full min-w-0 items-center gap-1.5 pl-3 font-mono text-xs", sel && "text-foreground")}
                >
                  <span className="truncate">{basename(t)}</span>
                  {t in ws.data.drafts ? <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="unsaved" /> : null}
                </button>
                <button type="button" aria-label={`Close ${basename(t)}`} onClick={() => requestClose(t)} data-testid={`button-close-tab-${t}`} className="grid h-full w-8 shrink-0 place-items-center text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Path row */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3 text-[11px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate font-mono" data-testid="text-open-path">{active}</span>
        <span className="shrink-0">{languageFromPath(active)}</span>
        <span className="flex w-3 shrink-0 justify-end"><Mark mark={marks.get(active)} /></span>
      </div>

      {findOpen && ready ? <FindBar view={getView} onClose={closeFind} /> : null}

      {/* Body */}
      <div className="relative min-h-0 flex-1">
        {load?.status === "error" && load.path === active ? (
          <div className="space-y-3 overflow-y-auto p-4">
            <ErrorState
              error={load.error}
              onRetry={["BINARY_FILE", "FILE_TOO_LARGE", "NOT_FOUND"].includes(describeError(load.error).code) ? undefined : () => ws.openFile(active)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => ws.closeFile(active)}>Close tab</Button>
              {ws.source.githubUrl ? (
                <Button asChild variant="secondary">
                  <a href={ws.source.githubUrl(active)} target="_blank" rel="noreferrer noopener">
                    <ExternalLink /> View on GitHub
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        ) : ready ? (
          <CodeEditor
            ref={editor}
            path={active}
            doc={load.doc}
            states={ws.editorStates}
            wrap={wrap}
            onChange={onChange}
            onHistory={onHistory}
            onFocusChange={onFocusChange}
            onSave={save}
            onFind={() => setFindOpen(true)}
          />
        ) : (
          <div className="space-y-2 p-4" aria-label="Loading file">
            {[70, 90, 55, 80, 40, 65, 75].map((w, i) => (
              <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
        {toast ? (
          <p role="status" className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full border bg-surface px-3 py-1.5 text-xs shadow-lg" data-testid="toast">
            {toast}
          </p>
        ) : null}
      </div>

      {/* Symbol bar while typing */}
      {focused ? (
        <div className="scrollbar-none flex shrink-0 gap-1 overflow-x-auto border-t bg-surface px-1.5 py-1.5" aria-label="Insert symbol" data-testid="symbol-bar">
          {SYMBOLS.map((s) => (
            <button
              key={s.label}
              type="button"
              aria-label={s.aria ?? `Insert ${s.insert}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => editor.current?.insert(s.insert)}
              className="grid h-9 min-w-9 shrink-0 place-items-center rounded-md bg-surface-2 px-2 font-mono text-sm active:bg-muted"
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Action bar */}
      <div className="flex shrink-0 items-center gap-1 border-t bg-surface px-2 pb-safe" onPointerDown={(e) => focused && e.preventDefault()}>
        <ActionButton label="Undo" testId="button-undo" disabled={!ready || !historyInfo.canUndo} onClick={() => editor.current?.undo()}>
          <Undo2 className="size-5" />
        </ActionButton>
        <ActionButton label="Redo" testId="button-redo" disabled={!ready || !historyInfo.canRedo} onClick={() => editor.current?.redo()}>
          <Redo2 className="size-5" />
        </ActionButton>
        <ActionButton label="Find" testId="button-find" disabled={!ready} onClick={() => setFindOpen((o) => !o)}>
          <Search className="size-5" />
        </ActionButton>
        <ActionButton label={saving ? "Saving" : "Save"} testId="button-save" primary={dirty} disabled={!ready || saving || !dirty} onClick={save}>
          <Save className="size-5" />
        </ActionButton>
        <ActionButton label="More" testId="button-more" onClick={() => { flushDraft(); setSheet("more"); }}>
          <MoreHorizontal className="size-5" />
        </ActionButton>
      </div>

      {/* Files drawer */}
      <Drawer.Root open={sheet === "drawer"} onOpenChange={(o) => setSheet(o ? "drawer" : null)} direction="left">
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
          <Drawer.Content className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-sm flex-col border-r bg-background pt-safe outline-none" aria-describedby={undefined}>
            <div className="flex h-12 shrink-0 items-center justify-between border-b pl-4 pr-1">
              <Drawer.Title className="text-sm font-semibold">Files</Drawer.Title>
              <Drawer.Close aria-label="Close files" className="grid size-11 place-items-center text-muted-foreground"><X className="size-5" /></Drawer.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-safe">
              <FilesBrowser
                onOpen={(p) => {
                  flushDraft();
                  ws.openFile(p);
                  setSheet(null);
                }}
                onSearch={() => {
                  setSheet(null);
                  onOpenSearch();
                }}
              />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* More */}
      <BottomSheet open={sheet === "more"} onOpenChange={(o) => setSheet(o ? "more" : null)} title={basename(active)} description={active}>
        <ul className="-mx-2">
          {[
            {
              icon: WrapText,
              label: wrap ? "Turn off word wrap" : "Turn on word wrap",
              id: "wrap",
              run: () => {
                setWrap((w) => {
                  safeStorage.set(WRAP_KEY, w ? "0" : "1");
                  return !w;
                });
                setSheet(null);
              },
            },
            { icon: PenLine, label: "Rename or move", id: "rename", run: () => setSheet("rename") },
            ...(change || dirty ? [{ icon: FileDiff, label: "Review changes", id: "diff", run: () => { setSheet(null); navigate(gitHref); } }] : []),
            ...(change || dirty ? [{ icon: RotateCcw, label: "Discard changes to this file", id: "discard", run: () => setSheet("discard"), danger: true }] : []),
            ...(ws.source.githubUrl && change?.status !== "added" ? [{ icon: ExternalLink, label: "Open on GitHub", id: "github", run: () => { window.open(ws.source.githubUrl!(active), "_blank", "noopener,noreferrer"); setSheet(null); } }] : []),
            { icon: Trash2, label: "Delete file", id: "delete", run: () => setSheet("delete"), danger: true },
          ].map((item) => (
            <li key={item.id}>
              <button type="button" onClick={item.run} data-testid={`menu-${item.id}`} className={cn("flex h-12 w-full items-center gap-3 rounded-md px-2 text-left text-sm hover:bg-surface-2", "danger" in item && item.danger && "text-danger")}>
                <item.icon className="size-4 shrink-0" aria-hidden /> {item.label}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>

      <InputSheet
        open={sheet === "rename"}
        onOpenChange={(o) => setSheet(o ? "rename" : null)}
        title="Rename or move"
        description="Type a new path to move the file to another folder."
        label="New path"
        initial={active}
        submitLabel="Rename"
        onSubmit={async (to) => {
          if (to.trim() === active) return;
          flushDraft();
          await ws.rename(active, to);
        }}
      />

      <ConfirmSheet
        open={sheet === "delete"}
        onOpenChange={(o) => setSheet(o ? "delete" : null)}
        title={`Delete ${basename(active)}?`}
        description={change?.status === "added" ? "This new file only exists on this device and will be removed." : "The file is removed from this workspace. The deletion is sent to GitHub only when you commit."}
        confirmLabel="Delete"
        onConfirm={() => ws.remove(active)}
      />

      <ConfirmSheet
        open={sheet === "discard"}
        onOpenChange={(o) => setSheet(o ? "discard" : null)}
        title="Discard changes?"
        description={change?.status === "added" ? "This new file will be removed." : "The file goes back to its content on the branch. This can't be undone."}
        confirmLabel="Discard"
        onConfirm={() => {
          clearTimeout(timer.current);
          pending.current = null;
          ws.revert(active);
        }}
      />

      <BottomSheet open={sheet === "close" && !!closing} onOpenChange={(o) => !o && setSheet(null)} title={`Save changes to ${closing ? basename(closing) : ""}?`} description="Unsaved edits are kept on this device until you save or discard them.">
        <div className="grid gap-2 pt-1">
          <Button
            data-testid="button-close-save"
            onClick={async () => {
              if (!closing) return;
              const draft = ws.data.drafts[closing] ?? (closing === active ? editor.current?.getDoc() : undefined);
              if (draft !== undefined) await ws.save(closing, draft);
              ws.closeFile(closing);
              setSheet(null);
            }}
          >
            Save and close
          </Button>
          <Button
            variant="secondary"
            data-testid="button-close-keep"
            onClick={() => {
              if (closing) ws.closeFile(closing);
              setSheet(null);
            }}
          >
            Close, keep draft
          </Button>
          <Button
            variant="ghost"
            className="text-danger"
            data-testid="button-close-discard"
            onClick={() => {
              if (!closing) return;
              ws.updateDraft(closing, ws.data.changes[closing]?.content ?? ws.peekBase(closing) ?? "");
              ws.closeFile(closing);
              setSheet(null);
            }}
          >
            Discard unsaved edits
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
