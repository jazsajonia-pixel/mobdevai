import { Link } from "wouter";
import { ChevronRight, Sparkles } from "lucide-react";
import { PROVIDERS } from "@/lib/ai-catalog";
import { cn } from "@/lib/utils";
import { useProviders } from "./use-providers";

/** One-line summary of the default provider, linking to AI provider settings. */
export function ActiveProviderLink({ className }: { className?: string }) {
  const { state } = useProviders();
  let line: string;
  let sub: string;
  if (state.status === "loading") {
    line = "AI providers";
    sub = "Loading…";
  } else if (state.status === "error") {
    line = "AI providers";
    sub = "Couldn't load — tap to retry";
  } else {
    const d = state.data;
    const def = d.providers.find((p) => p.id === d.defaultId);
    const enabled = d.providers.filter((p) => p.enabled).length;
    line = def ? (def.label === PROVIDERS[def.kind].name ? def.label : `${def.label} · ${PROVIDERS[def.kind].name}`) : "No provider yet";
    sub = def ? `${def.model} · ${enabled} enabled` : "Add an OpenAI, Anthropic, Gemini or compatible key";
  }
  return (
    <Link
      href="/app/settings/ai"
      className={cn("flex min-h-14 items-center gap-3 rounded-lg border bg-surface p-4 hover:bg-surface-2", className)}
      data-testid="link-ai-providers"
    >
      <Sparkles className="size-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{line}</span>
        <span className="block truncate font-mono text-xs text-muted-foreground" data-testid="text-active-provider">
          {sub}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
