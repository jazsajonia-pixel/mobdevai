import { useCallback, useEffect, useState } from "react";
import { listProviders } from "./api";
import type { ProvidersResponse } from "@/types/ai";

export type ProvidersState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: ProvidersResponse };

/** Loads the signed-in user's provider settings. */
export function useProviders() {
  const [state, setState] = useState<ProvidersState>({ status: "loading" });

  const reload = useCallback(() => {
    setState((s) => (s.status === "ready" ? s : { status: "loading" }));
    listProviders().then(
      (data) => setState({ status: "ready", data }),
      (error: unknown) => setState({ status: "error", error }),
    );
  }, []);

  useEffect(reload, [reload]);

  /** Mutations return the full new list — apply it without refetching. */
  const apply = useCallback((data: ProvidersResponse) => setState({ status: "ready", data }), []);
  return { state, reload, apply };
}
