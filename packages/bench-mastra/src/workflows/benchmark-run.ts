/**
 * `benchmark-run`: `planRun → .foreach(runOneModel, { concurrency }) →
 * finalizeRun`.
 *
 * `.foreach`'s signature (verified against the installed
 * `@mastra/core@1.55.0`, `dist/workflows/workflow.d.ts:213`) requires its
 * *previous* step to output an array type — enforced at the type level, not
 * just at runtime: the type parameter resolves to the literal string
 * `'Previous step must return an array type'` otherwise. `planRunStep`'s
 * `outputSchema` (`z.array(ModelWorkItemSchema)`) is what satisfies that.
 *
 * `ForeachOptions.concurrency` is required (the options object itself is
 * optional) and accepts `number | ForeachConcurrencyResolver`
 * (`dist/workflows/types.d.ts:485`). A resolver is used here rather than a
 * bare number so concurrency is read from the *run's own spec* at execution
 * time — `BRIEF.md` rule 7: "Fastest model" is a headline answer, so the
 * default (1) must be the trustworthy one, and a caller who explicitly asks
 * for more gets it.
 *
 * `createBenchmarkRunWorkflow` takes the two executors as arguments rather
 * than importing an implementation (`../executors.ts`) — this package ships
 * only a mock, and `benchmarkRunWorkflow` below is that mock wired in, which
 * is what `src/index.ts` registers and every test in this package runs
 * against (`BRIEF.md`, this phase: "Mock executor only ... no default path
 * ... may hit fal or a real database").
 */
import { workflowThen } from "@howells/mastra/workflows";
import { createWorkflow } from "@mastra/core/workflows";

import { mockGenerationExecutor, mockPersistExecutor } from "../executors";
import { finalizeRunStep } from "./finalize-run";
import { planRunStep } from "./plan-run";
import type { BenchmarkExecutors } from "./run-one-model";
import { createRunOneModelWorkflow } from "./run-one-model";
import { BenchRunSpecSchema, RunOutcomeSchema } from "./schemas";

/** Reads `concurrency` off the run's own input spec at execution time,
 * falling back to the trustworthy default (1) if the spec is ever malformed
 * — a resolver must never throw (it runs on Mastra's execution hot path).
 * `safeParse` (not an `as` cast) is what keeps this narrowing honest: the
 * resolver only ever sees a real `BenchRunSpec` shape or the safe default. */
const concurrencyFromRunSpec = (context: {
  getInitData: () => unknown;
}): number => {
  const parsed = BenchRunSpecSchema.pick({ concurrency: true }).safeParse(
    context.getInitData()
  );
  return parsed.success ? parsed.data.concurrency : 1;
};

export const createBenchmarkRunWorkflow = (executors: BenchmarkExecutors) => {
  const runOneModelWorkflow = createRunOneModelWorkflow(executors);

  return workflowThen(
    workflowThen(
      createWorkflow({
        description:
          "Plan, fan out per (model, sample), and finalize a benchmark run.",
        id: "benchmark-run",
        inputSchema: BenchRunSpecSchema,
        outputSchema: RunOutcomeSchema,
        retryConfig: { attempts: 0 },
      }),
      planRunStep
    ).foreach(runOneModelWorkflow, {
      concurrency: concurrencyFromRunSpec,
    }),
    finalizeRunStep
  ).commit();
};

/**
 * The registered singleton — wired to the mock executors this phase ships.
 * Swapping this for a real-executor build is a later phase's job (a real
 * `GenerationExecutor` backed by `@motif/bench-core/execute` and a real
 * `PersistExecutor` backed by `@motif/bench-db`), done by calling
 * `createBenchmarkRunWorkflow` with those instead — this file does not
 * change.
 */
export const benchmarkRunWorkflow = createBenchmarkRunWorkflow({
  generationExecutor: mockGenerationExecutor,
  persistExecutor: mockPersistExecutor,
});
