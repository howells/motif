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
  /** Keyed on the five fields the dry run actually reads — models, samples,
   * aspect, resolution, output format. The prompt is deliberately absent:
   * `buildPreview` aligns parameters and prices them, and no part of that
   * result depends on the prompt text, so keying on it would refetch on
   * every keystroke to produce a byte-identical answer.
   *
   * `outputFormat` has to be here even though it changes no price: it changes
   * which models report a dropped param, and the per-model dry run in the
   * models popover is exactly where that is read. */
  preview: (spec: RunSpecInput) =>
    [
      "bench",
      "preview",
      spec.aspect,
      spec.resolution,
      spec.samplesPerModel,
      spec.models.join(","),
      spec.outputFormat ?? "default",
    ] as const,
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

/** The dry run, continuously — no "Preview" button, no wall to scroll past.
 * The estimate it returns feeds the top bar's live summary line and its
 * per-model detail feeds the models popover
 * (`docs/design/specs/design-bench-shell.md`). Still a real dry run: the
 * route is `previewRun` → `buildPreview`, which aligns parameters and prices
 * them with **zero fal calls** and zero persistence.
 *
 * `staleTime: Infinity` because the answer is a pure function of the spec —
 * there is nothing on the server that can change it under us. */
export const usePreview = (spec: RunSpecInput, enabled: boolean) =>
  useQuery({
    enabled,
    queryFn: async () =>
      await requestJson<PreviewResult>("/api/runs/preview", {
        body: JSON.stringify(spec),
        method: "POST",
      }),
    queryKey: queryKeys.preview(spec),
    staleTime: Infinity,
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

/** Re-runs the failed part of a run. `null` retries every failed sample
 * (the sheet-level button); an array narrows to those samples (a single
 * failed frame retrying itself). `TVariables` is an explicit union rather
 * than an optional parameter, so both call sites pass a real argument —
 * TanStack requires one whenever `TVariables` is not `void`, and `null`
 * says "no narrowing" where a bare `undefined` would only read as "forgot
 * to pass anything".
 *
 * Both caches are invalidated: the detail because its samples just went
 * back to `pending`, and the list because the run's status went back to
 * `running`. That second invalidation is what restarts `useRun`'s polling —
 * its `refetchInterval` is derived from server state, so the retry streams
 * into the sheet in place, exactly as the original run did. */
export const useRetrySamples = (runId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sampleIds: readonly string[] | null) =>
      await requestJson<{ retried: number }>(`/api/runs/${runId}/retry`, {
        body: JSON.stringify(sampleIds === null ? {} : { sampleIds }),
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.run(runId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.runs() });
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
