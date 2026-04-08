"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type UseApiDataState<T> =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: null; error: string };

export type UseApiDataResult<T> = UseApiDataState<T> & {
  refetch: () => void;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
};

/**
 * Generic hook for fetching JSON data from internal API routes.
 * Expects { ok: true, data } or { ok: false, error } envelope.
 */
export function useApiData<T>(
  url: string | null,
  options?: { enabled?: boolean }
): UseApiDataResult<T> {
  const enabled = options?.enabled ?? true;
  const [state, setState] = useState<UseApiDataState<T>>({
    status: "idle",
    data: null,
    error: null,
  });

  const urlRef = useRef(url);
  urlRef.current = url;

  const fetchData = useCallback(async () => {
    if (!urlRef.current || !enabled) return;

    setState({ status: "loading", data: null, error: null });

    try {
      const res = await fetch(urlRef.current);
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setState({
          status: "error",
          data: null,
          error: json.error ?? `Request failed with status ${res.status}`,
        });
        return;
      }

      setState({ status: "success", data: json.data as T, error: null });
    } catch (err) {
      setState({
        status: "error",
        data: null,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled && url) {
      fetchData();
    }
  }, [url, enabled, fetchData]);

  return {
    ...state,
    refetch: fetchData,
    isLoading: state.status === "loading",
    isSuccess: state.status === "success",
    isError: state.status === "error",
  };
}

/**
 * Convenience hook for posting JSON to an API route.
 * Returns a submit function and state.
 */
export function useApiMutation<TBody, TResponse>(url: string, method: "POST" | "PATCH" | "DELETE" = "POST") {
  const [state, setState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    data: TResponse | null;
    error: string | null;
  }>({ status: "idle", data: null, error: null });

  const mutate = useCallback(
    async (body: TBody): Promise<{ ok: true; data: TResponse } | { ok: false; error: string }> => {
      setState({ status: "loading", data: null, error: null });

      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();

        if (!res.ok || !json.ok) {
          const msg = json.error ?? `Request failed with status ${res.status}`;
          setState({ status: "error", data: null, error: msg });
          return { ok: false, error: msg };
        }

        setState({ status: "success", data: json.data as TResponse, error: null });
        return { ok: true, data: json.data as TResponse };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setState({ status: "error", data: null, error: msg });
        return { ok: false, error: msg };
      }
    },
    [url, method]
  );

  const reset = useCallback(() => {
    setState({ status: "idle", data: null, error: null });
  }, []);

  return {
    mutate,
    reset,
    isLoading: state.status === "loading",
    isSuccess: state.status === "success",
    isError: state.status === "error",
    data: state.data,
    error: state.error,
  };
}
