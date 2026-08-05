/**
 * Unit tests for `deadline.ts`'s pure run-level deadline arithmetic and
 * reconciliation planning — no DB, no network, nothing to stub, per the
 * fix for the production hang `docs/arc/bench/BRIEF.md` documents (a run
 * with no deadline at all on the app's real Postgres + live engine path).
 */
import { describe, expect, it } from "vitest";

import {
  computeRunDeadlineMs,
  planReconciliation,
  RUN_DEADLINE_SAFETY_MARGIN_MS,
} from "./deadline";
import { LIVE_GENERATION_TIMEOUT_FLOOR_SECONDS } from "./live-engine";

describe("computeRunDeadlineMs", () => {
  it("uses the named floor, not a real p95, for a model that publishes none — the common case per BRIEF.md (12 of 23 models)", () => {
    const floorMs = Math.round(
      LIVE_GENERATION_TIMEOUT_FLOOR_SECONDS * 1.5 * 1000
    );
    const deadlineMs = computeRunDeadlineMs([{ speedP95Seconds: null }]);
    expect(deadlineMs).toBe(floorMs + RUN_DEADLINE_SAFETY_MARGIN_MS);
  });

  it("uses the real p95 × 1.5 when a model publishes one, not the floor", () => {
    const deadlineMs = computeRunDeadlineMs([{ speedP95Seconds: 40 }]);
    expect(deadlineMs).toBe(40 * 1.5 * 1000 + RUN_DEADLINE_SAFETY_MARGIN_MS);
  });

  it("sums per sample — samplesPerModel > 1 needs that many timeout budgets, since concurrency is not enforced as a real execution limiter", () => {
    const oneSample = computeRunDeadlineMs([{ speedP95Seconds: 40 }]);
    const fourSamples = computeRunDeadlineMs([
      { speedP95Seconds: 40 },
      { speedP95Seconds: 40 },
      { speedP95Seconds: 40 },
      { speedP95Seconds: 40 },
    ]);
    // The margin is flat (added once), so four identical samples give
    // exactly 4x the per-sample timeout plus one margin, not 4x everything.
    expect(fourSamples).toBe(
      (oneSample - RUN_DEADLINE_SAFETY_MARGIN_MS) * 4 +
        RUN_DEADLINE_SAFETY_MARGIN_MS
    );
  });

  it("mixes floor and real p95 correctly per sample — a majority-floor sweep still credits the models that do publish p95", () => {
    const deadlineMs = computeRunDeadlineMs([
      { speedP95Seconds: null }, // floor
      { speedP95Seconds: 20 }, // real, well under the floor
    ]);
    const floorMs = Math.round(
      LIVE_GENERATION_TIMEOUT_FLOOR_SECONDS * 1.5 * 1000
    );
    const realMs = Math.round(20 * 1.5 * 1000);
    expect(deadlineMs).toBe(floorMs + realMs + RUN_DEADLINE_SAFETY_MARGIN_MS);
  });
});

const NOW = new Date("2026-08-05T12:00:00.000Z");
const PAST_DEADLINE = new Date("2026-08-05T11:00:00.000Z").toISOString();
const FUTURE_DEADLINE = new Date("2026-08-05T13:00:00.000Z").toISOString();

describe("planReconciliation", () => {
  it("is a no-op for a run that is not running", () => {
    const plan = planReconciliation("completed", PAST_DEADLINE, NOW, [
      { id: "s1", status: "completed" },
    ]);
    expect(plan).toEqual({ finalRunStatus: null, timedOutSampleIds: [] });
  });

  it("is a no-op before the deadline has passed", () => {
    const plan = planReconciliation("running", FUTURE_DEADLINE, NOW, [
      { id: "s1", status: "pending" },
    ]);
    expect(plan).toEqual({ finalRunStatus: null, timedOutSampleIds: [] });
  });

  it("is a no-op when there is no deadline recorded (pre-existing rows)", () => {
    const plan = planReconciliation("running", null, NOW, [
      { id: "s1", status: "pending" },
    ]);
    expect(plan).toEqual({ finalRunStatus: null, timedOutSampleIds: [] });
  });

  it("marks every pending/running sample TIMEOUT and finalises as partial when some samples already succeeded", () => {
    const plan = planReconciliation("running", PAST_DEADLINE, NOW, [
      { id: "s1", status: "completed" },
      { id: "s2", status: "pending" },
      { id: "s3", status: "running" },
      { id: "s4", status: "failed" },
    ]);
    expect(plan.finalRunStatus).toBe("partial");
    expect(new Set(plan.timedOutSampleIds)).toEqual(new Set(["s2", "s3"]));
  });

  it("finalises as failed when nothing succeeded", () => {
    const plan = planReconciliation("running", PAST_DEADLINE, NOW, [
      { id: "s1", status: "pending" },
      { id: "s2", status: "failed" },
    ]);
    expect(plan.finalRunStatus).toBe("failed");
    expect(plan.timedOutSampleIds).toEqual(["s1"]);
  });

  it("finalises as completed (no timeouts to apply) when every sample already succeeded past the deadline", () => {
    const plan = planReconciliation("running", PAST_DEADLINE, NOW, [
      { id: "s1", status: "completed" },
      { id: "s2", status: "completed" },
    ]);
    expect(plan.finalRunStatus).toBe("completed");
    expect(plan.timedOutSampleIds).toEqual([]);
  });

  it("is idempotent — reconciling twice never re-times-out or double-counts", () => {
    const firstPass = planReconciliation("running", PAST_DEADLINE, NOW, [
      { id: "s1", status: "completed" },
      { id: "s2", status: "pending" },
    ]);
    expect(firstPass.finalRunStatus).toBe("partial");
    expect(firstPass.timedOutSampleIds).toEqual(["s2"]);

    // Applying the plan moves the run out of "running" and the sample out of
    // "pending" — exactly what `reconcileRunIfPastDeadline` does via
    // `finalizeRunIfDone`'s guarded UPDATE. A second call against that
    // resulting state must find nothing left to do.
    const secondPass = planReconciliation(
      firstPass.finalRunStatus,
      PAST_DEADLINE,
      NOW,
      [
        { id: "s1", status: "completed" },
        { id: "s2", status: "failed" },
      ]
    );
    expect(secondPass).toEqual({ finalRunStatus: null, timedOutSampleIds: [] });
  });
});
