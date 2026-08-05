/**
 * Pure, DB-free run-level deadline arithmetic and timeout-reconciliation
 * planning — the fix for the hang documented in `docs/arc/bench/BRIEF.md`'s
 * "what went wrong in production": a real 23-model sweep generated a real
 * image, its settle write failed, the sample stayed `pending` forever, and
 * nothing ever finalised the run because no run-level deadline existed on
 * the app's real (Postgres + live engine) path — `packages/bench-mastra`'s
 * per-model timeout and run-level deadline exist but are never reached; the
 * app drives generation directly through `db-store.ts`.
 *
 * Everything here is a pure function over plain data — no `db`, no
 * `setTimeout`, no I/O — so it is unit-testable without a database or a fal
 * call, and so `db-store.ts`'s DB-touching wrappers (`reconcileRunIfPastDeadline`,
 * `createRun`) stay thin, mirroring the `buildRunInsertRow` /
 * `createRun` split that file already uses.
 */
import { perAttemptTimeoutMs } from "./live-engine";
import type { SampleStatus } from "./types";

/** A flat cushion added on top of the summed per-sample timeouts below —
 * "modest" per `BRIEF.md`'s ask, not scaled by model count: the per-sample
 * timeouts already carry the `×1.5` headroom `timeoutMsForAlias` applies,
 * this only needs to absorb scheduling/DB-round-trip jitter across an
 * entire sweep, not add a second multiplicative safety factor. */
export const RUN_DEADLINE_SAFETY_MARGIN_MS = 10 * 60 * 1000;

export interface DeadlineSampleInput {
  readonly speedP95Seconds: number | null;
}

/** Sum of every planned sample's own per-attempt timeout
 * (`perAttemptTimeoutMs` — `speedP95Seconds × 1.5`, or
 * `LIVE_GENERATION_TIMEOUT_FLOOR_SECONDS × 1.5` when a model publishes no
 * p95, the common case per `BRIEF.md`: 12 of 23 models) plus a flat safety
 * margin. Takes one entry per *sample*, not per model — `samplesPerModel >
 * 1` genuinely needs that many timeout budgets, since nothing in this app
 * enforces `concurrency` as a real execution limiter (`validation.ts`'s
 * comment on the mock store: "the concurrency knob itself is not
 * simulated") — summing rather than taking a max is the conservative
 * (never-too-tight) choice for an upper bound. */
export const computeRunDeadlineMs = (
  samples: readonly DeadlineSampleInput[]
): number =>
  samples.reduce(
    (sum, sample) => sum + perAttemptTimeoutMs(sample.speedP95Seconds),
    0
  ) + RUN_DEADLINE_SAFETY_MARGIN_MS;

export interface ReconcileSampleInput {
  readonly id: string;
  readonly status: SampleStatus;
}

export interface ReconciliationPlan {
  /** The status this plan implies once its `timedOutSampleIds` are applied —
   * advisory only. `db-store.ts`'s `reconcileRunIfPastDeadline` uses this
   * solely to decide whether there is anything to do (`!== null`); the
   * actual write goes through the same `finalizeRunIfDone` the normal
   * settle path uses, recomputed against fresh post-update rows, so there is
   * exactly one place that decides the real persisted status. `null` means
   * "nothing to reconcile": the run isn't `running`, the deadline hasn't
   * passed, or the run has no samples. */
  readonly finalRunStatus: "completed" | "failed" | "partial" | null;
  readonly timedOutSampleIds: readonly string[];
}

const UNSETTLED_STATUSES: ReadonlySet<SampleStatus> = new Set([
  "pending",
  "running",
]);

/** Decides what a deadline-driven reconciliation pass should do, given the
 * run's current status/deadline and its samples' current statuses — called
 * both from a per-run `setTimeout` fired at creation time (`createRun`) and
 * from every `GET /api/runs/[id]` for a `running` run (`getRun`), per
 * `BRIEF.md`: "a timer alone dies with the process; reconciliation on read
 * survives a dev-server restart". Naturally idempotent: once applied, the
 * run's `status` is no longer `"running"`, so a second call with the
 * resulting status returns `{ finalRunStatus: null, timedOutSampleIds: [] }`
 * — nothing left to double-finalise or double-count. */
export const planReconciliation = (
  runStatus: string,
  deadlineAt: string | null,
  now: Date,
  samples: readonly ReconcileSampleInput[]
): ReconciliationPlan => {
  if (runStatus !== "running") {
    return { finalRunStatus: null, timedOutSampleIds: [] };
  }
  if (samples.length === 0) {
    return { finalRunStatus: null, timedOutSampleIds: [] };
  }
  if (deadlineAt === null || now.getTime() < new Date(deadlineAt).getTime()) {
    return { finalRunStatus: null, timedOutSampleIds: [] };
  }

  const timedOutSampleIds = samples
    .filter((sample) => UNSETTLED_STATUSES.has(sample.status))
    .map((sample) => sample.id);
  const timedOutIdSet = new Set(timedOutSampleIds);
  const succeededCount = samples.filter(
    (sample) => !timedOutIdSet.has(sample.id) && sample.status === "completed"
  ).length;
  const finalRunStatus: ReconciliationPlan["finalRunStatus"] =
    succeededCount === 0
      ? "failed"
      : succeededCount === samples.length
        ? "completed"
        : "partial";

  return { finalRunStatus, timedOutSampleIds };
};
