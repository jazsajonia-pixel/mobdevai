import { useCallback, useEffect, useState } from "react";
import { listProviders } from "./api";
import type { ProvidersResponse } from "@/types/ai";
import { useSession } from "@/stores/session";

export type ProvidersState =
  | { status: "loading" }
  | { status: "demo" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: ProvidersResponse };

/** Loads provider settings; demo sessions have no server session, so there's nothing to load. */
export function useProviders() {
  const { session } = useSession();
  const isDemo = session.mode !== "github";
  const [state, setState] = useState<ProvidersState>(isDemo ? { status: "demo" } : { status: "loading" });

  const reload = useCallback(() => {
    if (isDemo) {
      setState({ status: "demo" });
      return;
    }
    setState((s) => (s.status === "ready" ? s : { status: "loading" }));
    listProviders().then(
      (data) => setState({ status: "ready", data }),
      (error: unknown) => setState({ status: "error", error }),
    );
  }, [isDemo]);

  useEffect(reload, [reload]);

  /** Mutations return the full new list — apply it without refetching. */
  const apply = useCallback((data: ProvidersResponse) => setState({ status: "ready", data }), []);
  return { state, reload, apply };
}
