import { useEffect, useId, useState } from "react";
import { ExternalLink, Eye, EyeOff, Loader2, PlugZap } from "lucide-react";
import { BottomSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PROVIDERS, PROVIDER_KINDS } from "@/lib/ai-catalog";
import { AppError, describeError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { ProviderEffort, ProviderKind, ProvidersResponse, PublicProvider } from "@/types/ai";
import { createProvider, testProvider, updateProvider, type TestInput } from "./api";
import { TestResult, type TestState } from "./test-result";

const inputCls = "h-11 w-full rounded-md border bg-background px-3 text-base aria-[invalid=true]:border-danger";

/**
 * Add / edit provider sheet. The API key lives only in this component's state until it's
 * submitted; it's cleared on close and never written to local storage.
 */
export function ProviderForm({
  open,
  onOpenChange,
  editing,
  storageNote,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PublicProvider | null;
  storageNote: string;
  onSaved: (data: ProvidersResponse) => void;
}) {
  const ids = useId();
  const [kind, setKind] = useState<ProviderKind>("openai");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(PROVIDERS.openai.defaultModel);
  const [effort, setEffort] = useState<ProviderEffort>("medium");
  const [baseUrl, setBaseUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [makeDefault, setMakeDefault] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time the sheet opens; wipe the key when it closes.
  useEffect(() => {
    if (!open) {
      setApiKey("");
      setShowKey(false);
      return;
    }
    const k = editing?.kind ?? "openai";
    setKind(k);
    setLabel(editing?.label ?? "");
    setModel(editing?.model ?? PROVIDERS[k].defaultModel);
    setEffort(editing?.effort ?? "medium");
    setBaseUrl(editing?.baseUrl ?? "");
    setEnabled(editing?.enabled ?? true);
    setMakeDefault(false);
    setModels([]);
    setTest({ status: "idle" });
    setError(null);
  }, [open, editing]);

  const meta = PROVIDERS[kind];
  const suggestions = Array.from(new Set([...meta.suggestedModels, ...models]));
  const keyRequired = !editing;
  const trimmedKey = apiKey.trim();
  const modelChoicesReady = Boolean(editing || trimmedKey);

  function pickKind(k: ProviderKind) {
    setKind(k);
    setModel(PROVIDERS[k].defaultModel);
    setModels([]);
    setTest({ status: "idle" });
    setError(null);
  }

  function validate(): string | null {
    if (keyRequired && !trimmedKey) return "Paste an API key.";
    if (trimmedKey && /\s/.test(trimmedKey)) return "API keys can't contain spaces.";
    if (!model.trim()) return "Choose a model.";
    if (meta.needsBaseUrl && !baseUrl.trim()) return "Enter the provider's base URL.";
    return null;
  }

  async function runTest() {
    const v = validate();
    if (v) return setError(v);
    setError(null);
    setTest({ status: "running" });
    const b = meta.needsBaseUrl ? baseUrl.trim() : null;
    const input: TestInput =
      editing && !trimmedKey
        ? { id: editing.id, model: model.trim(), ...(meta.needsBaseUrl ? { baseUrl: b } : {}) }
        : { kind, model: model.trim(), baseUrl: b, apiKey: trimmedKey };
    try {
      const result = await testProvider(input);
      setModels(result.models);
      setTest({ status: "ok", result });
    } catch (err) {
      setTest({ status: "error", error: err });
    }
  }

  async function save() {
    const v = validate();
    if (v) return setError(v);
    setError(null);
    setSaving(true);
    try {
      const b = meta.needsBaseUrl ? baseUrl.trim() : null;
      const data = editing
        ? await updateProvider(editing.id, {
            label: label.trim() || meta.name,
            model: model.trim(),
            effort,
            ...(meta.needsBaseUrl ? { baseUrl: b } : {}),
            ...(trimmedKey ? { apiKey: trimmedKey } : {}),
            enabled,
            ...(makeDefault ? { makeDefault: true } : {}),
          })
        : await createProvider({ kind, label: label.trim() || undefined, model: model.trim(), effort, baseUrl: b, apiKey: trimmedKey, enabled, makeDefault });
      setApiKey("");
      onSaved(data);
      onOpenChange(false);
    } catch (err) {
      const { title } = describeError(err);
      setError(err instanceof AppError && err.message !== title ? `${title}: ${err.message}` : title);
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${editing.label}` : "Add AI provider"}
      description={editing ? "Leave the key empty to keep the saved one." : "Your key is sent to this app's server, never to the provider from your browser."}
    >
      <form
        className="space-y-4"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        data-testid="form-provider"
      >
        {!editing ? (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Provider</legend>
            <div role="radiogroup" aria-label="Provider" className="grid grid-cols-2 gap-2">
              {PROVIDER_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => pickKind(k)}
                  data-testid={`radio-kind-${k}`}
                  className="min-h-11 rounded-md border px-2 py-2 text-sm font-medium aria-checked:border-primary aria-checked:bg-primary/10 aria-checked:text-primary"
                >
                  {PROVIDERS[k].name}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {meta.needsBaseUrl ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Base URL</span>
            <input
              type="url"
              inputMode="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={cn(inputCls, "font-mono text-sm")}
              data-testid="input-base-url"
            />
            <span className="block text-xs text-muted-foreground">
              Any server implementing OpenAI's <span className="font-mono">/chat/completions</span>. Must be public https — private and local addresses are blocked.
            </span>
          </label>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor={`${ids}-key`} className="flex items-center justify-between text-sm font-medium">
            <span>API key{editing ? <span className="ml-1 font-normal text-muted-foreground">· saved {editing.keyHint}</span> : null}</span>
            {meta.keyUrl ? (
              <a href={meta.keyUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-normal text-primary">
                Get a key <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </label>
          <div className="relative">
            <input
              id={`${ids}-key`}
              type={showKey ? "text" : "password"}
              name="provider-secret"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={editing ? "Keep the saved key" : meta.keyPlaceholder}
              autoComplete="new-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              className={cn(inputCls, "pr-12 font-mono text-sm")}
              data-testid="input-api-key"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              aria-label={showKey ? "Hide key" : "Show key"}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground"
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{storageNote}</p>
          {!editing && !trimmedKey ? <p className="text-xs text-muted-foreground">Enter the API key to unlock model choices for this provider.</p> : null}
        </div>

        {modelChoicesReady ? <div data-testid="model-choice" className="space-y-1.5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Model</span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            list={`${ids}-models`}
            placeholder={meta.needsBaseUrl ? "e.g. llama-4-maverick" : meta.defaultModel}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className={cn(inputCls, "font-mono text-sm")}
            data-testid="input-model"
          />
          <datalist id={`${ids}-models`}>
            {suggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        {models.length ? <p className="-mt-2 text-xs text-primary">{models.length} models available for this API key. Choose the primary model below.</p> : !editing && trimmedKey ? <p className="-mt-2 text-xs text-muted-foreground">Test the key to fetch the models available to it.</p> : null}
        {suggestions.length ? (
          <div className="-mt-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Suggested models">
            {suggestions.slice(0, 24).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModel(m)}
                aria-pressed={model === m}
                className="h-8 shrink-0 rounded-full border px-3 font-mono text-xs aria-pressed:border-primary aria-pressed:text-primary"
              >
                {m}
              </button>
            ))}
          </div>
        ) : null}
        </div> : <p className="text-sm text-muted-foreground" data-testid="model-choice-locked">Add an API key first. Your available models will appear here.</p>}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Effort</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Model effort">{(["low", "medium", "high"] as ProviderEffort[]).map((value) => <button key={value} type="button" role="radio" aria-checked={effort === value} onClick={() => setEffort(value)} className="min-h-10 rounded-md border px-2 text-sm capitalize aria-checked:border-primary aria-checked:bg-primary/10 aria-checked:text-primary">{value}</button>)}</div>
          <p className="text-xs text-muted-foreground">Chrono maps effort to the selected provider’s native reasoning control when supported.</p>
        </fieldset>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            Name <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={meta.name} className={inputCls} data-testid="input-label" />
        </label>

        <div className="divide-y rounded-md border">
          <div className="flex items-center justify-between pl-3">
            <span className="text-sm">Enabled</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} label="Enabled" data-testid="switch-enabled" />
          </div>
          {!editing?.isDefault ? (
            <div className="flex items-center justify-between pl-3">
              <span className="text-sm">Use as default</span>
              <Switch checked={makeDefault && enabled} disabled={!enabled} onCheckedChange={setMakeDefault} label="Use as default" data-testid="switch-default" />
            </div>
          ) : null}
        </div>

        <TestResult state={test} />
        {error ? (
          <p role="alert" className="text-sm text-danger" data-testid="text-form-error">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={() => void runTest()} disabled={test.status === "running" || saving} data-testid="button-test-connection">
            {test.status === "running" ? <Loader2 className="animate-spin" /> : <PlugZap />} Test
          </Button>
          <Button type="submit" disabled={saving} data-testid="button-save-provider">
            {saving ? <Loader2 className="animate-spin" /> : null} {editing ? "Save" : "Add provider"}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
