import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, AtSign, Paperclip, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentAttachment, AgentMode } from "@/types/agent";
import { PlusMenu } from "./plus-menu";

export interface QuickAction {
  label: string;
  mode: AgentMode;
  text: string;
}
const UPLOAD_MAX_BYTES = 2_000_000;
const UPLOAD_TOTAL_BYTES = 5_000_000;
const UPLOAD_TYPES = new Set(["text/plain", "text/markdown", "application/json", "text/javascript", "application/javascript", "text/typescript", "text/css", "text/html", "image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Paths mentioned as @path that exist in the workspace. */
export function mentionedPaths(text: string, paths: readonly string[]): string[] {
  const set = new Set(paths);
  const out: string[] = [];
  for (const m of text.matchAll(/(?:^|\s)@([\w./\-[\]()@+]+)/g)) {
    const p = m[1]!.replace(/[.,;:!?)]+$/, "");
    if (set.has(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

export function Composer({
  mode,
  onModeChange,
  running,
  disabled,
  placeholder,
  paths,
  activeFile,
  quickActions,
  onSend,
  onStop,
  initialText = "",
}: {
  mode: AgentMode;
  onModeChange: (m: AgentMode) => void;
  running: boolean;
  disabled?: boolean;
  placeholder: string;
  paths: readonly string[];
  activeFile: string | null;
  quickActions: QuickAction[];
  onSend: (text: string, attach: string[], uploads: AgentAttachment[]) => void;
  onStop: () => void;
  /** Pre-filled message (e.g. "Fix with AI" from the preview). */
  initialText?: string;
}) {
  const [text, setText] = useState(initialText);
  const [attachActive, setAttachActive] = useState(true);
  const [uploads, setUploads] = useState<AgentAttachment[]>([]);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => document.documentElement.classList.remove("editor-focused"), []);
  useEffect(() => {
    if (!initialText) return;
    const el = ref.current;
    el?.focus();
    el?.setSelectionRange(initialText.length, initialText.length);
  }, [initialText]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    el.style.overflowY = el.scrollHeight > 160 ? "auto" : "hidden";
  }, [text]);

  // @mention autocomplete for the token under the caret.
  const token = useMemo(() => {
    const before = text.slice(0, caret);
    const m = /(?:^|\s)@([^\s@]*)$/.exec(before);
    return m ? { query: m[1]!, start: caret - m[1]!.length - 1 } : null;
  }, [text, caret]);
  const suggestions = useMemo(() => {
    if (!token) return [];
    const q = token.query.toLowerCase();
    return paths.filter((p) => p.toLowerCase().includes(q)).sort((a, b) => a.length - b.length).slice(0, 6);
  }, [token, paths]);

  function pick(path: string) {
    if (!token) return;
    const next = `${text.slice(0, token.start)}@${path} ${text.slice(caret)}`;
    setText(next);
    const pos = token.start + path.length + 2;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  async function addUploads(files: FileList | null) {
    if (!files?.length) return;
    const next = [...uploads];
    const skipped: string[] = [];
    for (const file of Array.from(files)) {
      if (!UPLOAD_TYPES.has(file.type) && !/\.(txt|md|json|js|jsx|ts|tsx|css|html|py|sql)$/i.test(file.name)) {
        skipped.push(`${file.name} (unsupported type)`);
        continue;
      }
      if (file.size > UPLOAD_MAX_BYTES || next.reduce((n, x) => n + x.size, 0) + file.size > UPLOAD_TOTAL_BYTES) {
        skipped.push(`${file.name} (too large)`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
      const data = dataUrl.split(",", 2)[1] ?? "";
      next.push({ name: file.name.slice(0, 120), mimeType: file.type || "application/octet-stream", data, size: file.size });
    }
    if (next.length > 6) skipped.push(`${next.length - 6} older file${next.length - 6 === 1 ? "" : "s"} (max 6)`);
    setUploads(next.slice(-6));
    setUploadNote(skipped.length ? `Not attached: ${skipped.join(", ")}. Images and text files up to 2 MB each.` : null);
  }
  function submit() {
    const t = text.trim();
    if (!t || running || disabled) return;
    const attach = [...(attachActive && activeFile ? [activeFile] : []), ...mentionedPaths(t, paths)];
    onSend(t, attach, uploads);
    setText("");
    setUploads([]);
    setUploadNote(null);
  }

  // Hide the tab bar while typing (more room above the keyboard). Restoring it is delayed so a tap on
  // Send isn't lost to the layout shift caused by the blur.
  const focusMode = (on: boolean) => {
    if (on) document.documentElement.classList.add("editor-focused");
    else setTimeout(() => document.activeElement !== ref.current && document.documentElement.classList.remove("editor-focused"), 250);
  };

  return (
    <div className="w-full min-w-0">
      {!text && !running && quickActions.length ? (
        <div className="stagger mb-2 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none" aria-label="Quick actions">
          {quickActions.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => {
                onModeChange(q.mode);
                setText(q.text);
                requestAnimationFrame(() => {
                  ref.current?.focus();
                  const end = q.text.length;
                  ref.current?.setSelectionRange(end, end);
                  setCaret(end);
                });
              }}
              className="h-8 shrink-0 rounded-full border bg-surface px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              data-testid={`quick-${q.label.toLowerCase().replace(/\W+/g, "-")}`}
            >
              {q.label}
            </button>
          ))}
        </div>
      ) : null}

      {suggestions.length ? (
        <ul className="animate-pop mb-2 overflow-hidden rounded-lg border bg-surface" role="listbox" aria-label="Mention a file">
          {suggestions.map((p) => (
            <li key={p}>
              <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)} className="flex h-10 w-full items-center gap-2 px-3 text-left font-mono text-xs hover:bg-surface-2">
                <AtSign className="size-3.5 shrink-0 text-muted-foreground" /> <span className="truncate">{p}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={uploadRef}
        type="file"
        multiple
        accept="image/*,.txt,.md,.json,.js,.jsx,.ts,.tsx,.css,.html,.py,.sql"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void addUploads(e.target.files);
          e.currentTarget.value = "";
        }}
        data-testid="input-agent-upload"
      />

      <form
        className="rounded-xl border bg-surface transition-colors focus-within:border-primary/50"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        data-testid="composer"
      >
        {uploads.length ? (
          <div className="flex gap-1.5 overflow-x-auto px-2.5 pt-2.5 scrollbar-none" aria-label="Attached files" data-testid="list-uploads">
            {uploads.map((file, i) => (
              <button
                key={`${file.name}-${i}`}
                type="button"
                onClick={() => setUploads((list) => list.filter((_, j) => j !== i))}
                className="animate-pop flex shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-primary"
                aria-label={`Remove ${file.name}`}
              >
                <Paperclip className="size-3" aria-hidden />
                <span className="max-w-32 truncate">{file.name}</span>
                <X className="size-3" aria-hidden />
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onFocus={() => focusMode(true)}
          onBlur={() => focusMode(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Message the AI"
          className="block max-h-40 min-h-12 w-full resize-none overflow-y-hidden bg-transparent px-3.5 pb-1 pt-3 text-base leading-snug outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-60 sm:text-sm"
          data-testid="input-agent-message"
        />
        <div className="flex min-w-0 items-center gap-1.5 p-1.5">
          <PlusMenu onAddFiles={() => uploadRef.current?.click()} disabled={disabled} />
          <div role="radiogroup" aria-label="Mode" className="flex shrink-0 rounded-lg border p-0.5">
            {(["ask", "agent"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => onModeChange(m)}
                title={m === "ask" ? "Read-only answers" : "Plans, then proposes edits"}
                className="h-8 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors aria-checked:bg-surface-2 aria-checked:text-foreground"
                data-testid={`mode-${m}`}
              >
                {m === "ask" ? "Ask" : "Agent"}
              </button>
            ))}
          </div>
          {activeFile ? (
            <button
              type="button"
              onClick={() => setAttachActive((a) => !a)}
              aria-pressed={attachActive}
              className={cn("flex h-8 min-w-0 items-center gap-1 rounded-full border px-2.5 font-mono text-[11px]", attachActive ? "border-primary/50 text-primary" : "text-muted-foreground line-through")}
              title={attachActive ? "Current file is attached" : "Current file not attached"}
              data-testid="toggle-attach-file"
            >
              <Paperclip className="size-3 shrink-0" />
              <span className="truncate">{activeFile.split("/").pop()}</span>
              {attachActive ? <X className="size-3 shrink-0" aria-hidden /> : null}
            </button>
          ) : (
            <span className="hidden min-w-0 truncate text-[11px] text-muted-foreground sm:block">@ mentions files</span>
          )}
          <span className="flex-1" />
          {running ? (
            <Button type="button" size="icon" variant="secondary" onClick={onStop} aria-label="Stop" data-testid="button-stop-agent" className="size-9 shrink-0 rounded-lg">
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" onPointerDown={(e) => e.preventDefault()} disabled={!text.trim() || disabled} aria-label="Send" data-testid="button-send-agent" className="size-9 shrink-0 rounded-lg">
              <ArrowUp />
            </Button>
          )}
        </div>
      </form>
      {uploadNote ? (
        <p role="status" className="mt-1.5 px-1 text-xs text-warning" data-testid="text-upload-note">
          {uploadNote}
        </p>
      ) : null}
    </div>
  );
}
