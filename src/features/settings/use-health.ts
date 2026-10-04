import { api } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import type { HealthResponse } from "@/types/workspace";

export function useHealth() {
  return useAsync(() => api<HealthResponse>("/health", { timeoutMs: 8_000 }), []);
}
