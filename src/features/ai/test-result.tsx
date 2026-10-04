import { CheckCircle2, XCircle } from "lucide-react";
import { AppError, describeError } from "@/lib/errors";
import type { TestProviderResponse } from "@/types/ai";

export type TestState = { status: "idle" } | { status: "running" } | { status: "ok"; result: TestProviderResponse } | { status: "error"; error: unknown };

/** Inline connection-test outcome. Server messages are already redacted of key material. */
export function TestResult({ state }: { state: TestState }) {
  if (state.status === "idle" || state.status === "running") return null;
  if (state.status === "ok") {
    const r = state.result;
    return (
      <div role="status" className="flex gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm" data-testid="test-result-ok">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium">Connected · {r.latencyMs} ms</p>
          <p className="mt-0.5 text-muted-foreground">
            <span className="font-mono">{r.model}</span> responded.
            {r.modelListed === false ? " It isn't in this key's model list, but it answered (it may be an alias)." : ""}
            {r.models.length ? ` ${r.models.length} models available.` : ""}
          </p>
        </div>
      </div>
    );
  }
  const { title, hint, code } = describeError(state.error);
  const detail = state.error instanceof AppError && state.error.message !== title ? state.error.message : null;
  return (
    <div role="alert" className="flex gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm" data-testid="test-result-error">
      <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {detail ? <p className="mt-0.5 break-words text-muted-foreground">{detail}</p> : null}
        <p className="mt-0.5 text-muted-foreground">{hint}</p>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{code}</p>
      </div>
    </div>
  );
}
