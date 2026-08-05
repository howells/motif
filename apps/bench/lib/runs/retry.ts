/**
 * Pure, DB-free planning for re-running *part* of a finished run — the
 * recovery path for transient provider failures, `RATE_LIMITED` above all.
 * A 24-model sweep that loses three samples to rate limiting is not a run
 * worth paying for twice; only the three failures need re-dispatching.
 *
 * Same shape as `./deadline.ts`: everything here is a pure function over
 * plain data, so the rules that decide whether money gets spent are
 * unit-testable without a database or a fal call, and `db-store.ts`'s
 * `retrySamples` stays a thin wrapper that applies the plan.
 *
 * The three refusals below are all "would spend money wrongly" guards, and
 * each one exists because the alternative is a real defect:
 *
 * - `RUN_STILL_RUNNING` — a `pending` sample is in the air. Re-dispatching
 *   it generates and pays for the same image twice, and the second settle
 *   overwrites the first.
 * - `ENGINE_MISMATCH` — `bench_runs.is_mock` is written once, at creation,
 *   and the whole app reads it to decide whether a sample's bytes are real
 *   (`imageUrlForCompletedSample`). Retrying a mock run against the live
 *   engine (credentials added since) would mix real images into a run
 *   flagged synthetic, and the reverse would write synthetic images into a
 *   run flagged real — the exact class of bug `db-store.ts`'s header calls
 *   out.
 * - `COST_CAP` — `assertRunWithinCostCap` guards `createRun` only. Without
 *   this, retry is an unmetered spend button: the cap was agreed once, at
 *   composition, and a retry has to answer to it too.
 */
import type { RunStatus, SampleStatus } from "./types";

export type RetryRefusalReason =
  | "COST_CAP"
  | "ENGINE_MISMATCH"
  | "NOTHING_TO_RETRY"
  | "RUN_STILL_RUNNING";

export interface RetryCandidate {
  readonly costEstimatedMicros: number | null;
  readonly id: string;
  readonly status: SampleStatus;
}

export interface RetryPlanInput {
  /** Already spent on this run's successes. Retrying does not refund it, so
   * it is the floor the cap is measured from. */
  readonly costActualMicros: number | null;
  readonly engineIsMock: boolean;
  readonly maxEstimatedCostUsd: number;
  /** When present, restricts the retry to these sample ids — the per-frame
   * "retry just this one" affordance. Ids outside the run, or naming
   * samples that are not `failed`, are filtered out rather than rejected:
   * the plan is defined by what is genuinely retryable, never by what the
   * caller asked for. */
  readonly only?: readonly string[] | undefined;
  readonly runIsMock: boolean;
  readonly runStatus: RunStatus;
  readonly samples: readonly RetryCandidate[];
}

export interface RetryPlan {
  /** Non-null means nothing was planned and nothing should be written. */
  readonly refusal: RetryRefusalReason | null;
  readonly retryCostMicros: number;
  readonly sampleIds: readonly string[];
}

const refused = (refusal: RetryRefusalReason): RetryPlan => ({
  refusal,
  retryCostMicros: 0,
  sampleIds: [],
});

/** Every failed sample is retryable, whatever its error code. A permanently
 * broken alignment (`HTTP_4XX`) or a refused prompt (`SAFETY`) will simply
 * fail the same way again, and a failed provider call is not billed — so
 * filtering by "transient-looking" codes would only make the button lie
 * about which frames it covers, for no saving. The user pressed retry; the
 * closed vocabulary is a diagnosis, not a permission system.
 *
 * `completed` samples are never candidates even when named explicitly.
 * That is the double-charge guard *and* the reason retry never orphans an
 * image on disk: nothing with an `image_path` is ever re-dispatched. */
export const planRetry = (input: RetryPlanInput): RetryPlan => {
  if (input.runStatus === "running") {
    return refused("RUN_STILL_RUNNING");
  }
  if (input.runIsMock !== input.engineIsMock) {
    return refused("ENGINE_MISMATCH");
  }

  const only = input.only === undefined ? null : new Set(input.only);
  const candidates = input.samples.filter(
    (sample) =>
      sample.status === "failed" && (only === null || only.has(sample.id))
  );
  if (candidates.length === 0) {
    return refused("NOTHING_TO_RETRY");
  }

  const retryCostMicros = candidates.reduce(
    (sum, sample) => sum + (sample.costEstimatedMicros ?? 0),
    0
  );
  // Measured against the run's own agreed cap, not a fresh one: spend so far
  // plus what this retry could cost must still fit inside the number the
  // composer signed off. Rounded because `maxEstimatedCostUsd` is a float
  // and micros are integers — `0.1 * 1_000_000` is not exactly `100_000`.
  const capMicros = Math.round(input.maxEstimatedCostUsd * 1_000_000);
  if ((input.costActualMicros ?? 0) + retryCostMicros > capMicros) {
    return refused("COST_CAP");
  }

  return {
    refusal: null,
    retryCostMicros,
    sampleIds: candidates.map((sample) => sample.id),
  };
};

/** What both stores' `retrySamples` return. Lives here, in the DB-free
 * module, so `mock-store.ts` can satisfy the contract without importing
 * `db-store.ts` — which would drag `@motif/bench-db/client` into the mock
 * path and break the zero-env `next build` gate. */
export interface RetryResult {
  readonly refusal: RetryRefusalReason | null;
  readonly retried: number;
}

/** Human-readable refusal copy, keyed off the closed reason set so the API
 * and the UI cannot drift apart on wording. */
export const RETRY_REFUSAL_MESSAGE: Record<RetryRefusalReason, string> = {
  COST_CAP:
    "Retrying these samples would take the run past its cost cap. Raise the cap or start a new run.",
  ENGINE_MISMATCH:
    "This run was generated by a different engine than the one now configured. Start a new run instead.",
  NOTHING_TO_RETRY: "This run has no failed samples to retry.",
  RUN_STILL_RUNNING:
    "This run is still generating. Wait for it to settle before retrying.",
};
