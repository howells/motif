/**
 * Time budget for `generate` steps.
 *
 * `benchmark.speed.p95Seconds` is missing for 12 of the 23 `GENERATION_MODELS`
 * aliases (`docs/arc/bench/BRIEF.md` verified ground truth) — the explicit
 * floor below is the common path, not a rare edge case, so it is a named,
 * recorded constant rather than an inline magic number. `planRun` derives
 * each selected model's own cap from this and folds the run-level deadline
 * from the slowest one; `RunOutcomeSchema.timeoutFloorMs` records the floor
 * that applied so a report can explain why a run took as long as it did.
 */
export const TIMEOUT_FLOOR_MS = 60_000;

/** Applied to a model's `p95Seconds` when one is known — mirrors the plan's
 * "run-level deadline derived from p95Seconds × 1.5" instruction. */
export const TIMEOUT_MULTIPLIER = 1.5;

/**
 * One model's own generation timeout: `p95Seconds × 1.5` when known, else the
 * floor. This is never a *fresh* cap applied at the moment `generate` starts
 * — it only sizes the run-level deadline (the slowest selected model's value
 * becomes `deadlineAt`) and serves as `generate`'s fallback for the rare case
 * a work item reaches it with no `deadlineAt` at all.
 */
export const perModelTimeoutMs = (speedP95Seconds: number | null): number =>
  speedP95Seconds === null
    ? TIMEOUT_FLOOR_MS
    : Math.round(speedP95Seconds * 1000 * TIMEOUT_MULTIPLIER);
