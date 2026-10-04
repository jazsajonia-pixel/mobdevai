import { Database, ShieldCheck, Timer } from "lucide-react";
import type { ProvidersResponse } from "@/types/ai";

/** States plainly where keys live — required by the security model, not decoration. */
export function StorageNotice({ data }: { data: ProvidersResponse }) {
  const Icon = data.storage === "database" ? Database : data.storage === "session" ? Timer : ShieldCheck;
  const title =
    data.storage === "database" ? "Saved encrypted on the server" : data.storage === "session" ? "Session-only keys" : "Key storage unavailable";
  return (
    <div className="flex gap-3 rounded-lg border bg-surface p-4" data-testid="notice-storage" data-storage={data.storage}>
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-muted-foreground">{data.storageNote}</p>
        <p className="mt-2 text-xs text-muted-foreground">Keys are never shown again after saving — only a masked hint. All provider calls run in server functions.</p>
      </div>
    </div>
  );
}
