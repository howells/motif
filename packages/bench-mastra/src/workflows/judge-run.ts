/**
 * `judge-run`: `loadSamples → .foreach(judgeOne, { concurrency }) →
 * finalizeJudging`.
 *
 * Unlike `benchmark-run`'s per-item nested workflow (`generate` + `persist`,
 * two steps per item), `judgeOne` is a single step — `.foreach`'s `step`
 * parameter type is `Step<...>` (verified against the installed
 * `@mastra/core@1.55.0` `dist/workflows/workflow.d.ts:213`); a committed
 * `Workflow` also satisfies that shape, which is what let `benchmark-run.ts`
 * pass a nested workflow, but a bare `Step` from `createStep` works directly
 * when there is only one step per item. `loadSamplesStep`'s `outputSchema`
 * (`z.array(SampleToJudgeSchema)`) is what satisfies `.foreach`'s
 * "previous step must return an array type" constraint, same as
 * `benchmark-run.ts`'s `planRunStep`.
 *
 * Persisting each judgment happens inside `finalizeJudging`, batched over the
 * whole `.foreach` result array via the injected `JudgmentPersistExecutor` —
 * the team lead's brief names exactly three steps (`loadSamples`,
 * `judgeOne`, `finalizeJudging`), so persistence is folded into the
 * aggregation step rather than adding a fourth.
 *
 * `retryConfig: { attempts: 0 }` throughout, same discipline as
 * `benchmark-run`: a judgment costs a real vision-model call and is not safe
 * to silently replay.
 */
import { workflowThen } from "@howells/mastra/workflows";
import { SpanType } from "@mastra/core/observability";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { JudgmentResult } from "@motif/bench-core/judge";
import { z } from "zod";

import type {
  JudgeExecutor,
  JudgmentPersistExecutor,
  PersistJudgmentInput,
  SampleLoaderExecutor,
} from "../executors";
import {
  mockJudgeExecutor,
  mockJudgmentPersistExecutor,
  mockSampleLoaderExecutor,
} from "../executors";
import { buildSafeBenchAttributes } from "../safe-attributes";
import {
  JudgeOutcomeSchema,
  JudgeRunOutcomeSchema,
  JudgeRunSpecSchema,
  SampleToJudgeSchema,
} from "./judge-schemas";
import type {
  JudgeOutcome,
  JudgeRunSpec,
  SampleToJudge,
} from "./judge-schemas";

/** Mirrors `bench-core/judge.ts`'s `ROOM_RUBRIC_ID`/`ROOM_RUBRIC_VERSION` —
 * needed here only to fill in the (still-required, `NOT NULL`)
 * `bench_judgments.rubric_id`/`rubric_version` columns for an *inconclusive*
 * judgment, which never reaches `judgeSample`'s own rubric-tagging return
 * path. Duplicated as a literal rather than value-imported — see
 * `executors.ts`'s `mockJudgeExecutor` for the same rationale. */
const ROOM_RUBRIC_ID = "bench-room-v1";
const ROOM_RUBRIC_VERSION = 1;

export interface JudgeRunExecutors {
  readonly judgeExecutor: JudgeExecutor;
  readonly persistExecutor: JudgmentPersistExecutor;
  readonly sampleLoaderExecutor: SampleLoaderExecutor;
}

/** Reads `concurrency` off the run's own input spec at execution time,
 * falling back to the trustworthy default (4) if the spec is ever malformed
 * — mirrors `benchmark-run.ts`'s `concurrencyFromRunSpec`. Judging is
 * read-only against already-generated samples, so (unlike generation) there
 * is no "fastest model" honesty concern pinning the default to 1. */
const concurrencyFromRunSpec = (context: {
  getInitData: () => unknown;
}): number => {
  const parsed = JudgeRunSpecSchema.pick({ concurrency: true }).safeParse(
    context.getInitData()
  );
  return parsed.success ? parsed.data.concurrency : 4;
};

const createLoadSamplesStep = (executor: SampleLoaderExecutor) =>
  createStep({
    description:
      "Load every sample of a run that needs judging (a DB read, behind the injected SampleLoaderExecutor).",
    execute: async ({ inputData: spec }): Promise<SampleToJudge[]> => {
      const raw = await executor.loadSamples(spec.runId);
      return raw.map((sample) => ({
        imagePath: sample.imagePath,
        judgeModel: spec.judgeModel,
        prompt: sample.prompt,
        runId: spec.runId,
        sampleId: sample.sampleId,
      }));
    },
    id: "load-samples",
    inputSchema: JudgeRunSpecSchema,
    outputSchema: z.array(SampleToJudgeSchema),
    retries: 0,
  });

const outcomeFromJudgment = (
  sample: SampleToJudge,
  judgment: JudgmentResult
): JudgeOutcome =>
  judgment.status === "scored"
    ? {
        critique: judgment.critique,
        judgeModel: sample.judgeModel,
        levels: judgment.levels,
        overall: judgment.overall,
        overallLevel: judgment.overallLevel,
        rubricId: judgment.rubricId,
        rubricVersion: judgment.rubricVersion,
        runId: sample.runId,
        sampleId: sample.sampleId,
        status: "scored",
      }
    : {
        errorCode: judgment.errorCode,
        judgeModel: sample.judgeModel,
        runId: sample.runId,
        sampleId: sample.sampleId,
        status: "inconclusive",
      };

const spanMetadataFor = (outcome: JudgeOutcome): Record<string, unknown> =>
  outcome.status === "scored"
    ? {
        "bench.quality_level": outcome.overallLevel,
        "bench.quality_score": outcome.overall,
      }
    : { "bench.error.code": outcome.errorCode };

const createJudgeOneStep = (executor: JudgeExecutor) =>
  createStep({
    description:
      "Judge one sample via the injected JudgeExecutor; never throws.",
    execute: async ({ inputData: sample, tracingContext }) => {
      const span = tracingContext?.currentSpan?.createChildSpan({
        input: { sampleId: sample.sampleId },
        name: "bench.judge",
        type: SpanType.GENERIC,
      });

      let judgment: JudgmentResult;
      try {
        judgment = await executor.judge({
          imagePath: sample.imagePath,
          prompt: sample.prompt,
        });
      } catch {
        // Backstop only — `JudgeExecutor.judge` is documented never to throw
        // (it mirrors `bench-core`'s `judgeSample` contract, itself
        // never-throws), same posture as `generate.ts`'s `raceDeadline`
        // backstop around `GenerationExecutor.execute`.
        judgment = { errorCode: "JUDGE_UNAVAILABLE", status: "inconclusive" };
      }

      const outcome = outcomeFromJudgment(sample, judgment);
      span?.end({
        metadata: buildSafeBenchAttributes(spanMetadataFor(outcome)),
      });
      return outcome;
    },
    id: "judge-one",
    inputSchema: SampleToJudgeSchema,
    outputSchema: JudgeOutcomeSchema,
    retries: 0,
  });

const persistInputFor = (outcome: JudgeOutcome): PersistJudgmentInput =>
  outcome.status === "scored"
    ? {
        critique: outcome.critique,
        errorCode: null,
        judgeModel: outcome.judgeModel,
        levels: outcome.levels,
        overall: outcome.overall,
        rubricId: outcome.rubricId,
        rubricVersion: outcome.rubricVersion,
        sampleId: outcome.sampleId,
        status: "scored",
      }
    : {
        critique: null,
        errorCode: outcome.errorCode,
        judgeModel: outcome.judgeModel,
        levels: null,
        overall: null,
        rubricId: ROOM_RUBRIC_ID,
        rubricVersion: ROOM_RUBRIC_VERSION,
        sampleId: outcome.sampleId,
        status: "inconclusive",
      };

const createFinalizeJudgingStep = (executor: JudgmentPersistExecutor) =>
  createStep({
    description:
      "Persist every judgment (batched, via the injected JudgmentPersistExecutor) and summarize the run.",
    execute: async (params) => {
      const outcomes = params.inputData;
      const spec = params.getInitData<JudgeRunSpec>();

      // A persist failure for one judgment must not take the whole summary
      // down — same posture as `persist.ts`'s per-item catch in
      // `benchmark-run`; the judgment itself already happened (and, for a
      // scored outcome, already cost money) regardless of whether the DB
      // write succeeds.
      await Promise.all(
        outcomes.map(async (outcome) => {
          try {
            await executor.persistJudgment(persistInputFor(outcome));
          } catch {
            // Swallowed deliberately — see comment above.
          }
        })
      );

      const scored = outcomes.filter((outcome) => outcome.status === "scored");
      const inconclusive = outcomes.filter(
        (outcome) => outcome.status === "inconclusive"
      );

      return {
        inconclusiveCount: inconclusive.length,
        isMock: spec.isMock,
        meanOverall:
          scored.length === 0
            ? null
            : scored.reduce((sum, outcome) => sum + outcome.overall, 0) /
              scored.length,
        runId: spec.runId,
        scoredCount: scored.length,
        totalCount: outcomes.length,
      };
    },
    id: "finalize-judging",
    inputSchema: z.array(JudgeOutcomeSchema),
    outputSchema: JudgeRunOutcomeSchema,
    retries: 0,
  });

export const createJudgeRunWorkflow = (executors: JudgeRunExecutors) =>
  workflowThen(
    workflowThen(
      createWorkflow({
        description:
          "Load a run's samples, judge each blind against the room rubric, and finalize.",
        id: "judge-run",
        inputSchema: JudgeRunSpecSchema,
        outputSchema: JudgeRunOutcomeSchema,
        retryConfig: { attempts: 0 },
      }),
      createLoadSamplesStep(executors.sampleLoaderExecutor)
    ).foreach(createJudgeOneStep(executors.judgeExecutor), {
      concurrency: concurrencyFromRunSpec,
    }),
    createFinalizeJudgingStep(executors.persistExecutor)
  ).commit();

/**
 * The registered singleton — wired to the mock executors this phase ships
 * (`../executors.ts`). A real-executor build (a `SampleLoaderExecutor` and
 * `JudgmentPersistExecutor` backed by `@motif/bench-db`, a `JudgeExecutor`
 * wrapping `@motif/bench-core/judge`'s `judgeSample` with a real
 * `LanguageModel`) is a later phase's job, done by calling
 * `createJudgeRunWorkflow` with those instead — this file does not change.
 */
export const judgeRunWorkflow = createJudgeRunWorkflow({
  judgeExecutor: mockJudgeExecutor,
  persistExecutor: mockJudgmentPersistExecutor,
  sampleLoaderExecutor: mockSampleLoaderExecutor,
});
