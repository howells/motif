/**
 * Unit tests for `retry.ts`'s pure planning — no DB, no fal call. Every
 * assertion here is about *whether money gets spent*, which is why the
 * planner is a pure function in the first place: the guards that stop a
 * retry from double-charging, from mixing synthetic and real images into
 * one run, or from blowing past the agreed cap must be testable without
 * standing up a run.
 */
import { describe, expect, it } from "vitest";

import { planRetry } from "./retry";
import type { RetryCandidate, RetryPlanInput } from "./retry";

const sample = (
  id: string,
  status: RetryCandidate["status"],
  costEstimatedMicros: number | null = 10_000
): RetryCandidate => ({ costEstimatedMicros, id, status });

const input = (overrides: Partial<RetryPlanInput> = {}): RetryPlanInput => ({
  costActualMicros: 0,
  engineIsMock: false,
  maxEstimatedCostUsd: 1,
  runIsMock: false,
  runStatus: "partial",
  samples: [sample("a", "failed"), sample("b", "completed")],
  ...overrides,
});

describe("planRetry", () => {
  it("plans only the failed samples, leaving completed ones alone", () => {
    const plan = planRetry(input());
    expect(plan.refusal).toBeNull();
    expect(plan.sampleIds).toEqual(["a"]);
    expect(plan.retryCostMicros).toBe(10_000);
  });

  it("never re-dispatches a completed sample even when named explicitly — that would pay for the same image twice and orphan the one already on disk", () => {
    const plan = planRetry(input({ only: ["a", "b"] }));
    expect(plan.sampleIds).toEqual(["a"]);
  });

  it("narrows to a single named sample — the per-frame retry affordance", () => {
    const plan = planRetry(
      input({
        only: ["c"],
        samples: [sample("a", "failed"), sample("c", "failed")],
      })
    );
    expect(plan.sampleIds).toEqual(["c"]);
    expect(plan.retryCostMicros).toBe(10_000);
  });

  it("ignores ids that name nothing in the run rather than rejecting the whole retry", () => {
    const plan = planRetry(input({ only: ["a", "not-in-this-run"] }));
    expect(plan.refusal).toBeNull();
    expect(plan.sampleIds).toEqual(["a"]);
  });

  it("retries a failed sample whatever its error code — a repeat failure is not billed, so filtering by 'transient-looking' codes would only make the button lie about its coverage", () => {
    const plan = planRetry(
      input({
        samples: [sample("safety", "failed"), sample("limited", "failed")],
      })
    );
    expect(plan.sampleIds).toEqual(["safety", "limited"]);
  });

  it("refuses while the run is still generating — a pending sample is in the air and re-dispatching it double-charges", () => {
    const plan = planRetry(input({ runStatus: "running" }));
    expect(plan.refusal).toBe("RUN_STILL_RUNNING");
    expect(plan.sampleIds).toEqual([]);
  });

  it("refuses when a mock run would be retried against the live engine — real bytes must never land in a run flagged synthetic", () => {
    const plan = planRetry(input({ engineIsMock: false, runIsMock: true }));
    expect(plan.refusal).toBe("ENGINE_MISMATCH");
  });

  it("refuses the reverse mismatch too — synthetic images must never land in a run flagged real", () => {
    const plan = planRetry(input({ engineIsMock: true, runIsMock: false }));
    expect(plan.refusal).toBe("ENGINE_MISMATCH");
  });

  it("refuses a run with nothing failed", () => {
    const plan = planRetry(input({ samples: [sample("b", "completed")] }));
    expect(plan.refusal).toBe("NOTHING_TO_RETRY");
  });

  it("refuses when spend-so-far plus the retry would pass the run's agreed cap — assertRunWithinCostCap guards createRun only, so retry needs its own", () => {
    const plan = planRetry(
      input({ costActualMicros: 995_000, maxEstimatedCostUsd: 1 })
    );
    expect(plan.refusal).toBe("COST_CAP");
  });

  it("allows a retry that lands exactly on the cap", () => {
    const plan = planRetry(
      input({ costActualMicros: 990_000, maxEstimatedCostUsd: 1 })
    );
    expect(plan.refusal).toBeNull();
  });

  it("measures the cap against spend so far, not against the estimate — a run that came in under budget can afford its own retry", () => {
    const plan = planRetry(
      input({ costActualMicros: 10_000, maxEstimatedCostUsd: 0.05 })
    );
    expect(plan.refusal).toBeNull();
    expect(plan.retryCostMicros).toBe(10_000);
  });

  it("treats an unpriced sample as free rather than throwing — the cap arithmetic must not depend on a nullable column", () => {
    const plan = planRetry(input({ samples: [sample("a", "failed", null)] }));
    expect(plan.refusal).toBeNull();
    expect(plan.retryCostMicros).toBe(0);
  });
});
