import { useState } from "react";
import { Loader2, Pencil, PlugZap, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PROVIDERS } from "@/lib/ai-catalog";
import type { ProvidersResponse, PublicProvider } from "@/types/ai";
import { testProvider, updateGeminiModel, updateProvider } from "./api";
import { TestResult, type TestState } from "./test-result";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ProviderCard({
  provider: p,
  onChanged,
  onEdit,
  onRemove,
  onError,
  geminiModels,
}: {
  provider: PublicProvider;
  onChanged: (data: ProvidersResponse) => void;
  onEdit: () => void;
  onRemove: () => void;
  onError: (err: unknown) => void;
  geminiModels?: { id: string; available: boolean }[];
}) {
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const platform = p.source === "platform";

  async function mutate(patch: Parameters<typeof updateProvider>[1]) {
    setBusy(true);
    try {
      onChanged(await updateProvider(p.id, patch));
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setTest({ status: "running" });
    try {
      setTest({ status: "ok", result: await testProvider({ id: p.id }) });
    } catch (err) {
      setTest({ status: "error", error: err });
    }
  }

  async function changeGeminiModel(model: string) {
    setBusy(true);
    try {
      onChanged(await updateGeminiModel(model));
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  const last = test.status === "idle" ? p.lastTest : null;

  return (
    <article className="rounded-lg border bg-surface" data-testid={`card-provider-${p.id}`} aria-label={p.label}>
      <div className="flex items-start gap-3 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold">{p.label}</h3>
            {p.isDefault ? (
              <Badge tone="primary" data-testid="badge-default">
                Default
              </Badge>
            ) : null}
            {!p.enabled ? <Badge>Disabled</Badge> : null}
            {platform ? <Badge tone="warning">Server</Badge> : null}
          </div>
          {p.label !== PROVIDERS[p.kind].name ? <p className="mt-1 text-xs text-muted-foreground">{PROVIDERS[p.kind].name}</p> : null}
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Model</dt>
            <dd className="truncate font-mono">
              {platform && p.kind === "gemini" && geminiModels?.length ? (
                <select
                  value={p.model}
                  disabled={busy}
                  onChange={(event) => void changeGeminiModel(event.target.value)}
                  className="h-8 max-w-full rounded-md border bg-background px-2 font-mono text-xs"
                  aria-label="Server Gemini model"
                  data-testid="select-server-gemini-model"
                >
                  {geminiModels.filter((m) => m.available || m.id === p.model).map((m) => <option key={m.id} value={m.id}>{m.id}{m.id === "gemini-flash-latest" ? " (default)" : ""}</option>)}
                </select>
              ) : p.model}
            </dd>
            <dt className="text-muted-foreground">Effort</dt>
            <dd className="capitalize">{p.effort}</dd>
            {p.baseUrl ? (
              <>
                <dt className="text-muted-foreground">Base URL</dt>
                <dd className="truncate font-mono">{p.baseUrl}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Key</dt>
            <dd className="font-mono" data-testid="text-key-hint">
              {p.keyHint}
            </dd>
            {last ? (
              <>
                <dt className="text-muted-foreground">Last test</dt>
                <dd className={last.ok ? "text-primary" : "text-danger"}>
                  {last.ok ? `OK · ${last.latencyMs ?? "?"} ms` : (last.code ?? "Failed")} · {when(last.at)}
                </dd>
              </>
            ) : null}
          </dl>
        </div>
        {!platform ? (
          <Switch checked={p.enabled} disabled={busy} onCheckedChange={(enabled) => void mutate({ enabled })} label={`${p.enabled ? "Disable" : "Enable"} ${p.label}`} data-testid="switch-provider-enabled" />
        ) : null}
      </div>

      {test.status !== "idle" && test.status !== "running" ? (
        <div className="px-4 pb-2">
          <TestResult state={test} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-t px-2 py-1.5">
        <Button variant="ghost" size="sm" onClick={() => void runTest()} disabled={test.status === "running" || !p.enabled} data-testid="button-test-provider">
          {test.status === "running" ? <Loader2 className="animate-spin" /> : <PlugZap />} Test
        </Button>
        {!p.isDefault && p.enabled ? (
          <Button variant="ghost" size="sm" onClick={() => void mutate({ makeDefault: true })} disabled={busy} data-testid="button-make-default">
            <Star /> Make default
          </Button>
        ) : null}
        {!platform ? (
          <>
            <Button variant="ghost" size="sm" onClick={onEdit} data-testid="button-edit-provider">
              <Pencil /> Edit
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto text-danger" onClick={onRemove} data-testid="button-remove-provider">
              <Trash2 /> Remove
            </Button>
          </>
        ) : null}
      </div>
    </article>
  );
}
