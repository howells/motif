/**
 * `runOneModel`: the nested workflow `.foreach` fans out over — one per
 * `(model, sample)` work item. `.foreach` validates at runtime that its step
 * argument is a `Workflow`, which is exactly what confirms nested-workflow-
 * per-item is the intended shape for multi-step-per-item fan-out (verified
 * against `@mastra/core@1.55.0`'s `dist/workflows/workflow.d.ts`).
 *
 * `retryConfig: { attempts: 0 }` at the workflow level, `retries: 0` on both
 * steps — generations are expensive and non-idempotent, so nothing here may
 * silently replay.
 */
import { workflowThen } from "@howells/mastra/workflows";
import { createWorkflow } from "@mastra/core/workflows";

import type { GenerationExecutor, PersistExecutor } from "../executors";
import { createGenerateStep } from "./generate";
import { createPersistStep } from "./persist";
import { ModelWorkItemSchema, PersistOutcomeSchema } from "./schemas";

export interface BenchmarkExecutors {
  readonly generationExecutor: GenerationExecutor;
  readonly persistExecutor: PersistExecutor;
}

export const createRunOneModelWorkflow = (executors: BenchmarkExecutors) =>
  workflowThen(
    workflowThen(
      createWorkflow({
        description: "Generate one model's one sample, then persist it.",
        id: "run-one-model",
        inputSchema: ModelWorkItemSchema,
        outputSchema: PersistOutcomeSchema,
        retryConfig: { attempts: 0 },
      }),
      createGenerateStep(executors.generationExecutor)
    ),
    createPersistStep(executors.persistExecutor)
  ).commit();
