import { createStep } from "@mastra/core/workflows";
/**
 * `finalizeRun`: aggregates every `.foreach` result into the run's summary.
 *
 * Reads two things out of the wider run rather than just its own
 * `inputData`: the original spec (`getInitData`, for `isMock`) and `planRun`'s
 * own output (`getStepResult(planRunStep)`, for the shared `deadlineAt` —
 * every work item carries the same value, so the first is representative).
 * Both accessors are on `ExecuteFunctionParams`
 * (`@mastra/core/dist/workflows/step.d.ts`), not something invented here.
 */
import { aggregateByModel } from "@motif/bench-core";
import type { AggregateSampleInput } from "@motif/bench-core";
import { z } from "zod";

import { TIMEOUT_FLOOR_MS } from "./constants";
import { planRunStep } from "./plan-run";
import { PersistOutcomeSchema, RunOutcomeSchema } from "./schemas";
import type { BenchRunSpec } from "./schemas";

export const finalizeRunStep = createStep({
  description: "Aggregate every persisted outcome into the run's summary.",
  // `params` is taken whole (not destructured) so `getInitData`/
  // `getStepResult` are invoked as bound methods on the object Mastra hands
  // in, not detached function references.
  // oxlint-disable-next-line require-await -- execute must return a Promise; everything below (getInitData/getStepResult reads, aggregateByModel) is synchronous
  execute: async (params) => {
    const outcomes = params.inputData;
    const spec = params.getInitData<BenchRunSpec>();
    const planned = params.getStepResult(planRunStep);
    const deadlineAt = planned[0]?.deadlineAt ?? Date.now();

    const succeededCount = outcomes.filter(
      (outcome) => outcome.status === "completed"
    ).length;
    const status: "completed" | "failed" | "partial" =
      outcomes.length === 0 || succeededCount === 0
        ? "failed"
        : succeededCount === outcomes.length
          ? "completed"
          : "partial";

    const aggregateInputs: AggregateSampleInput[] = outcomes.map((outcome) => ({
      costRefinedMicros: outcome.costRefinedMicros,
      downloadMs: outcome.downloadMs,
      modelAlias: outcome.alias,
      providerMs: outcome.providerMs,
      status: outcome.status,
      totalMs: outcome.totalMs,
    }));

    return {
      costEstimatedMicros: outcomes.reduce(
        (sum, outcome) => sum + outcome.costEstimatedMicros,
        0
      ),
      deadlineAt,
      isMock: spec.isMock,
      models: aggregateByModel(aggregateInputs),
      runId: spec.runId,
      status,
      timeoutFloorMs: TIMEOUT_FLOOR_MS,
    };
  },
  id: "finalize-run",
  inputSchema: z.array(PersistOutcomeSchema),
  outputSchema: RunOutcomeSchema,
  retries: 0,
});
