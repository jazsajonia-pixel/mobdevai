import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, AtSign, Paperclip, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentMode } from "@/types/agent";

export interface QuickAction {
  label: string;
  mode: AgentMode;
  text: string;
}

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
}: {
  mode: AgentMode;
  onModeChange: (m: AgentMode) => void;
  running: boolean;
  disabled?: boolean;
  placeholder: string;
  paths: readonly string[];
  activeFile: string | null;
  quickActions: QuickAction[];
  onSend: (text: string, attach: string[]) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [attachActive, setAttachActive] = useState(true);
  const [caret, setCaret] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => document.documentElement.classList.remove("editor-focused"), []);

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

  function submit() {
    const t = text.trim();
    if (!t || running || disabled) return;
    const attach = [...(attachActive && activeFile ? [activeFile] : []), ...mentionedPaths(t, paths)];
    onSend(t, attach);
    setText("");
  }

  // Hide the tab bar while typing (more room above the keyboard). Restoring it is delayed so a tap on
  // Send isn't lost to the layout shift caused by the blur.
  const focusMode = (on: boolean) => {
    if (on) document.documentElement.classList.add("editor-focused");
    else setTimeout(() => document.activeElement !== ref.current && document.documentElement.classList.remove("editor-focused"), 250);
  };

  return (
    <div className="shrink-0 border-t bg-surface px-3 pb-2 pt-2">
      {!text && !running && quickActions.length ? (
        <div className="-mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3 pb-0.5" aria-label="Quick actions">
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
              className="h-8 shrink-0 rounded-full border px-3 text-xs text-muted-foreground hover:text-foreground"
              data-testid={`quick-${q.label.toLowerCase().replace(/\W+/g, "-")}`}
            >
              {q.label}
            </button>
          ))}
        </div>
      ) : null}

      {suggestions.length ? (
        <ul className="mb-2 overflow-hidden rounded-md border bg-background" role="listbox" aria-label="Mention a file">
          {suggestions.map((p) => (
            <li key={p}>
              <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)} className="flex h-10 w-full items-center gap-2 px-3 text-left font-mono text-xs hover:bg-surface-2">
                <AtSign className="size-3.5 shrink-0 text-muted-foreground" /> <span className="truncate">{p}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mb-2 flex items-center gap-2">
        <div role="radiogroup" aria-label="Mode" className="flex rounded-md border p-0.5">
          {(["ask", "agent"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => onModeChange(m)}
              className="h-8 rounded px-3 text-xs font-medium text-muted-foreground aria-checked:bg-surface-2 aria-checked:text-foreground"
              data-testid={`mode-${m}`}
            >
              {m === "ask" ? "Ask" : "Agent"}
            </button>
          ))}
        </div>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{mode === "ask" ? "Read-only · @ mentions files" : "Plans, then edits · @ mentions files"}</span>
        {activeFile ? (
          <button
            type="button"
            onClick={() => setAttachActive((a) => !a)}
            aria-pressed={attachActive}
            className={cn("flex h-8 max-w-[45%] items-center gap-1 rounded-full border px-2.5 font-mono text-[11px]", attachActive ? "border-primary/50 text-primary" : "text-muted-foreground line-through")}
            title={attachActive ? "Current file is attached" : "Current file not attached"}
            data-testid="toggle-attach-file"
          >
            <Paperclip className="size-3 shrink-0" />
            <span className="truncate">{activeFile.split("/").pop()}</span>
            {attachActive ? <X className="size-3 shrink-0" aria-hidden /> : null}
          </button>
        ) : null}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
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
          rows={Math.min(6, Math.max(1, text.split("\n").length))}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Message the AI"
          className="max-h-40 min-h-11 flex-1 resize-none rounded-md border bg-background px-3 py-2.5 text-base leading-snug disabled:opacity-60"
          data-testid="input-agent-message"
        />
        {running ? (
          <Button type="button" size="icon" variant="secondary" onClick={onStop} aria-label="Stop" data-testid="button-stop-agent">
            <Square className="fill-current" />
          </Button>
        ) : (
          <Button type="submit" size="icon" onPointerDown={(e) => e.preventDefault()} disabled={!text.trim() || disabled} aria-label="Send" data-testid="button-send-agent">
            <ArrowUp />
          </Button>
        )}
      </form>
    </div>
  );
}
