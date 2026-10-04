import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/features/workspace/context";
import { analyzeProject, type PreviewPlan, type PreviewPlanOk } from "./detect";
import { BuildError, buildPreview, codeFrame, type BuildResult } from "./bundler";
import { joinPath, dirname } from "./paths";
import { savePreviewStatus } from "./status";

export interface ConsoleEntry {
  id: number;
  level: "log" | "info" | "warn" | "error" | "debug";
  text: string;
  at: number;
}

export interface RuntimeError {
  id: number;
  message: string;
  stack: string;
  kind: string;
  file: string | null;
  line: number | null;
  column: number | null;
  frame: string | null;
}

export type PreviewState =
  | { status: "analyzing" }
  | { status: "unsupported"; plan: Extract<PreviewPlan, { supported: false }> }
  | { status: "building"; plan: PreviewPlanOk; previous: BuildResult | null }
  | { status: "ready"; plan: PreviewPlanOk; result: BuildResult }
  | { status: "error"; plan: PreviewPlanOk | null; error: BuildError };

const MAX_LOGS = 300;

/** Find the first preview:/// frame in a stack and map it to a code frame (Sucrase keeps line numbers). */
export function locate(stack: string, sources: Map<string, string>): Pick<RuntimeError, "file" | "line" | "column" | "frame"> {
  const m = /preview:\/\/\/([^\s):]+):(\d+):(\d+)/.exec(stack);
  if (!m) return { file: null, line: null, column: null, frame: null };
  const file = m[1]!;
  const line = Number(m[2]);
  // Columns don't survive the transform reliably (helpers/renamed imports); lines do.
  const src = sources.get(file);
  return { file, line, column: null, frame: src ? codeFrame(src, line, null) : null };
}

export function usePreview(opts: { assetUrl?: (path: string) => string | null }) {
  const ws = useWorkspace();
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const [state, setState] = useState<PreviewState>({ status: "analyzing" });
  const [page, setPage] = useState<string | null>(null);
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [errors, setErrors] = useState<RuntimeError[]>([]);
  const [booted, setBooted] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const resultRef = useRef<BuildResult | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const seq = useRef(0);
  const run = useRef(0);
  const assetUrl = useRef(opts.assetUrl);
  assetUrl.current = opts.assetUrl;

  const read = useCallback(async (p: string) => {
    const w = wsRef.current;
    if (!w.exists(p)) throw new Error("not in the workspace");
    return w.getBuffer(p);
  }, []);

  const build = useCallback(
    async (targetPage?: string | null) => {
      const id = ++run.current;
      const w = wsRef.current;
      const prev = resultRef.current;
      let plan: PreviewPlan;
      try {
        plan = await analyzeProject(w.paths, (p) => (w.exists(p) ? w.getBuffer(p).catch(() => null) : Promise.resolve(null)));
      } catch (e) {
        if (id === run.current) setState({ status: "error", plan: null, error: new BuildError(e instanceof Error ? e.message : "Couldn't analyse the project.") });
        return;
      }
      if (id !== run.current) return;
      if (!plan.supported) {
        setState({ status: "unsupported", plan });
        return;
      }
      setState({ status: "building", plan, previous: prev });
      try {
        const pg = targetPage && plan.pages.includes(targetPage) ? targetPage : plan.html;
        const result = await buildPreview({ plan, page: pg, paths: w.paths, read, assetUrl: assetUrl.current });
        if (id !== run.current) return;
        resultRef.current = result;
        setLogs([]);
        setErrors([]);
        setBooted(false);
        setPage(result.page);
        setFrameKey((k) => k + 1);
        setState({ status: "ready", plan, result });
      } catch (e) {
        if (id !== run.current) return;
        const err = e instanceof BuildError ? e : new BuildError(e instanceof Error ? e.message : "Build failed.");
        setState({ status: "error", plan, error: err });
      }
    },
    [read],
  );

  // Initial build, then rebuild (debounced) whenever workspace content changes.
  const first = useRef(true);
  useEffect(() => {
    const delay = first.current ? 0 : 700;
    first.current = false;
    const t = setTimeout(() => void build(page), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.data.changes, ws.data.drafts, ws.paths, build]);

  // Messages from the sandboxed frame: only accept our frame + this build's nonce; treat as text.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const r = resultRef.current;
      const d = e.data as Record<string, unknown> | null;
      if (!r || !d || typeof d !== "object" || d.__mdai !== r.nonce) return;
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const str = (v: unknown, n = 4000) => (typeof v === "string" ? v.slice(0, n) : "");
      switch (d.type) {
        case "boot":
          break;
        case "ready":
          setBooted(true);
          break;
        case "console": {
          const level = (["log", "info", "warn", "error", "debug"] as const).find((l) => l === d.level) ?? "log";
          setLogs((l) => [...l.slice(-(MAX_LOGS - 1)), { id: ++seq.current, level, text: str(d.text), at: Date.now() }]);
          break;
        }
        case "error": {
          const stack = str(d.stack);
          const entry: RuntimeError = { id: ++seq.current, message: str(d.message, 2000), stack, kind: str(d.kind, 20), ...locate(stack, r.sources) };
          setErrors((x) => (x.length > 20 ? x : [...x, entry]));
          setLogs((l) => [...l.slice(-(MAX_LOGS - 1)), { id: ++seq.current, level: "error", text: entry.message, at: Date.now() }]);
          break;
        }
        case "navigate": {
          const href = str(d.href, 1000).split(/[?#]/)[0]!;
          const target = href.startsWith("/") ? joinPath(r.root, href.slice(1)) : joinPath(dirname(r.page), href);
          const candidates = target === null ? [] : [target, `${target.replace(/\/$/, "")}/index.html`, `${target}.html`];
          const hit = candidates.find((c) => wsRef.current.exists(c) && /\.html?$/.test(c));
          if (hit) void build(hit);
          else setLogs((l) => [...l, { id: ++seq.current, level: "warn", text: `[preview] Link to "${href}" isn't a page in this project.`, at: Date.now() }]);
          break;
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [build]);

  // Remember the outcome for the project dashboard.
  const storageKey = ws.source.storageKey;
  useEffect(() => {
    const at = new Date().toISOString();
    if (state.status === "ready") savePreviewStatus(storageKey, { status: "ready", label: state.plan.label, runtimeErrors: errors.length, at });
    else if (state.status === "error") savePreviewStatus(storageKey, { status: "error", label: state.plan?.label ?? "Preview", runtimeErrors: 0, message: state.error.message.slice(0, 200), at });
    else if (state.status === "unsupported") savePreviewStatus(storageKey, { status: "unsupported", label: state.plan.label, runtimeErrors: 0, message: state.plan.reason, at });
  }, [state, errors.length, storageKey]);

  return {
    state,
    page,
    logs,
    errors,
    booted,
    frameKey,
    frameRef,
    rebuild: () => void build(page),
    goToPage: (p: string) => void build(p),
    reload: () => {
      setLogs([]);
      setErrors([]);
      setBooted(false);
      setFrameKey((k) => k + 1);
    },
    clearLogs: () => setLogs([]),
    dismissErrors: () => setErrors([]),
  };
}

