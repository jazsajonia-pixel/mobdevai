import { safeStorage } from "@/lib/storage";

/** Last preview outcome per workspace — shown on the project dashboard. */
export interface PreviewStatusRecord {
  status: "ready" | "error" | "unsupported";
  label: string;
  /** Runtime errors reported by the running app (ready builds only). */
  runtimeErrors: number;
  message?: string;
  at: string;
}

const key = (wsKey: string) => `preview-status:${wsKey}`;

export function savePreviewStatus(wsKey: string, rec: PreviewStatusRecord): void {
  safeStorage.set(key(wsKey), JSON.stringify(rec));
}

export function loadPreviewStatus(wsKey: string): PreviewStatusRecord | null {
  try {
    const raw = safeStorage.get(key(wsKey));
    return raw ? (JSON.parse(raw) as PreviewStatusRecord) : null;
  } catch {
    return null;
  }
}
