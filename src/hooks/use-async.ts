import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncState<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: undefined; error: unknown };

/** Minimal data-loading hook with retry. Ignores results from stale runs. */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const run = useRef(0);

  const execute = useCallback(() => {
    const id = ++run.current;
    setState({ status: "loading" });
    fn().then(
      (data) => id === run.current && setState({ status: "success", data }),
      (error: unknown) => id === run.current && setState({ status: "error", error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    execute();
  }, [execute]);

  return { ...state, retry: execute };
}
