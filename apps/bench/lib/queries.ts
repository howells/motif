/**
 * All client-side data fetching for bench-web goes through React Query
 * hooks defined here — `docs/arc/bench/BRIEF.md`: "React Query for all
 * client fetching. No raw `fetch` in a component." Every hook below wraps
 * exactly one `fetch` to the app's own route handlers (`app/api/**`); no
 * component calls `fetch` directly.
 *
 * Polling, not SSE (`BRIEF.md`'s architecture section): `useRuns` and
 * `useRun` set `refetchInterval` to a short interval only while something is
 * still in flight, and `false` once settled — so a finished run's detail
 * page stops polling on its own, and history stops polling once nothing is
 * `running`. Both survive a refresh because the interval is re-derived from
 * server state on every mount, never from client-only flags.
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ManualRatingRecord,
  PreviewResult,
  RunDetail,
  RunSpecInput,
  RunSummary,
} from "@/lib/runs/types";

export const queryKeys = {
  run: (runId: string) => ["bench", "runs", runId] as const,
  runs: () => ["bench", "runs"] as const,
};

interface ApiErrorBody {
  readonly code: string;
  readonly error: string;
}

class ApiError extends Error {
  readonly code: string;

  constructor(body: ApiErrorBody) {
    super(body.error);
    this.name = "ApiError";
    this.code = body.code;
  }
}

const requestJson = async <T>(
  input: string,
  init?: RequestInit
): Promise<T> => {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  // `no-store` is load-bearing, not defensive. These routes carry no
  // cache-control headers, so the browser is free to heuristically cache a
  // GET — which makes every poll replay the first response and a run appears
  // frozen at "generating..." forever even after it has completed. The bug is
  // invisible to a curl-based check of the API, because curl is not the thing
  // doing the caching.
  const response = await fetch(input, { ...init, cache: "no-store", headers });
  const body: unknown = await response.json();
  if (!response.ok) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every route handler in app/api/** returns { code, error } on a non-2xx response (see lib/api-response.ts's jsonError/jsonValidationError)
    throw new ApiError(body as ApiErrorBody);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- caller supplies T to match the route handler's documented success shape; there is no runtime schema to validate a same-origin, same-app response against
  return body as T;
};

export { ApiError };

const RUNNING_POLL_MS = 2500;

export const usePreview = () =>
  useMutation({
    mutationFn: async (spec: RunSpecInput) =>
      await requestJson<PreviewResult>("/api/runs/preview", {
        body: JSON.stringify(spec),
        method: "POST",
      }),
  });

export const useCreateRun = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (spec: RunSpecInput) =>
      await requestJson<{ runId: string }>("/api/runs", {
        body: JSON.stringify(spec),
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.runs() });
    },
  });
};

export const useRuns = () =>
  useQuery({
    queryFn: async () => await requestJson<{ runs: RunSummary[] }>("/api/runs"),
    queryKey: queryKeys.runs(),
    // Same reason as `useRun`: the history list must keep advancing while the
    // user is looking at another tab.
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      const hasRunningRun =
        query.state.data?.runs.some((run) => run.status === "running") ?? false;
      return hasRunningRun ? RUNNING_POLL_MS * 2 : false;
    },
  });

export const useRun = (runId: string) =>
  useQuery({
    enabled: runId.length > 0,
    queryFn: async () => await requestJson<RunDetail>(`/api/runs/${runId}`),
    queryKey: queryKeys.run(runId),
    // React Query pauses interval refetching while the tab is unfocused. A
    // full sweep takes 15-25 minutes, and nobody watches a progress bar for
    // that long — they switch tabs and come back. Without this, the run
    // appears frozen at "generating..." on return until a manual refresh.
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      const data = query.state.data;
      // No data yet means the first fetch is still in flight or it failed.
      // Keep polling rather than switching off: returning false here leaves a
      // slow or failed initial load permanently inert, with no way to recover
      // short of a manual refresh.
      if (!data) {
        return RUNNING_POLL_MS;
      }
      const stillGenerating = data.run.status === "running";
      const stillJudging = data.run.judgingStatus === "running";
      return stillGenerating || stillJudging ? RUNNING_POLL_MS : false;
    },
  });

/** No caller in this UI ever picks a custom judge model — the mutation
 * takes no variables at all (`TVariables` infers as `void`) so `.mutate()`
 * is a genuine zero-argument call, rather than an optional-string variable
 * that TypeScript would still require an explicit (if `undefined`) argument
 * for. The server route defaults `judgeModel` on its own
 * (`JudgeRunInputSchema`, `lib/runs/validation.ts`). */
export const useJudgeRun = (runId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      await requestJson<{ started: boolean }>(`/api/runs/${runId}/judge`, {
        body: JSON.stringify({}),
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.run(runId) });
    },
  });
};

export const useSetManualRating = (runId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sampleId,
      stars,
      note,
    }: {
      note?: string | null;
      sampleId: string;
      stars: number;
    }) =>
      await requestJson<ManualRatingRecord>(`/api/samples/${sampleId}/rating`, {
        body: JSON.stringify({ note, stars }),
        method: "PUT",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.run(runId) });
    },
  });
};
