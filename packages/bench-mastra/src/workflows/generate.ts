import { SpanType } from "@mastra/core/observability";
import { createStep } from "@mastra/core/workflows";
/**
 * `generate`: runs one model's one attempt through the injected
 * `GenerationExecutor` and always resolves to a `GenerateOutcome` —
 * `status: "failed"` covers an alignment rejection, a timeout, and every
 * `ExecuteErrorCode`, but the step itself never throws (`BRIEF.md`:
 * "error-as-data at the step boundary ... one dead model cannot fail the
 * other 22"). `retries: 0` — a silent replay of an expensive, non-idempotent
 * generation would corrupt both cost and latency.
 *
 * A child span is created for every work item regardless of outcome
 * (`tracingContext?.currentSpan?.createChildSpan(...)`, verified against the
 * installed `@mastra/core@1.55.0` types — `ObservabilityContext` in
 * `dist/observability/types/core.d.ts`) and ended with only the closed,
 * schema-validated attributes from `../safe-attributes.ts`. No prompt, no
 * fal URL, and no base64/data URI is ever passed to `createChildSpan` or
 * `span.end` — `BRIEF.md` rules 1 and 3.
 */
import type { AlignmentOk } from "@motif/bench-core";
import type { ExecuteResult } from "@motif/bench-core/execute";

import type { GenerationExecutor } from "../executors";
import { buildSafeBenchAttributes } from "../safe-attributes";
import { raceDeadline } from "./deadline";
import { GenerateOutcomeSchema, ModelWorkItemSchema } from "./schemas";
import type { GenerateOutcome, ModelWorkItem } from "./schemas";

type OutcomeBase = Pick<
  GenerateOutcome,
  | "alias"
  | "costBasis"
  | "costEstimatedMicros"
  | "endpoint"
  | "executionOrdinal"
  | "modelName"
  | "runId"
  | "sampleIndex"
  | "usesQueue"
>;

const baseFor = (item: ModelWorkItem): OutcomeBase => ({
  alias: item.alias,
  costBasis: item.costBasis,
  costEstimatedMicros: item.costEstimatedMicros,
  endpoint: item.endpoint,
  executionOrdinal: item.executionOrdinal,
  modelName: item.modelName,
  runId: item.runId,
  sampleIndex: item.sampleIndex,
  usesQueue: item.usesQueue,
});

const imagePathFor = (item: ModelWorkItem): string =>
  `${item.runId}/${item.alias}/${item.sampleIndex}`;

type FailedGenerateOutcome = Extract<GenerateOutcome, { status: "failed" }>;

const failureOutcome = (
  base: OutcomeBase,
  errorCode: FailedGenerateOutcome["errorCode"],
  requestBody: Record<string, unknown>,
  timing: {
    downloadMs: number | null;
    providerMs: number | null;
    totalMs: number;
  }
): GenerateOutcome => ({
  ...base,
  ...timing,
  errorCode,
  requestBody,
  status: "failed",
});

/** Runs the executor and interprets its outcome — kept separate from
 * `execute` so the step itself stays a thin span/glue wrapper. Never throws:
 * every branch (alignment rejection, executor throw, timeout, provider
 * failure, success) resolves to a `GenerateOutcome`. */
const runAttempt = async (
  item: ModelWorkItem,
  executor: GenerationExecutor
): Promise<GenerateOutcome> => {
  const base = baseFor(item);
  const { alignment } = item;

  // Alignment was already resolved in `planRun` (pure, synchronous) — a
  // rejection here means `alignParams` and `buildGenerateBody` drifted
  // (bench-core/align-params.ts's own drift-guard backstop), not that the
  // provider was ever called. `HTTP_4XX` is the closest of the eight closed
  // codes to "the request we tried to build was invalid".
  if (!alignment.ok) {
    return failureOutcome(
      base,
      "HTTP_4XX",
      {},
      {
        downloadMs: null,
        providerMs: null,
        totalMs: 0,
      }
    );
  }

  return await runExecutor(base, alignment, item, executor);
};

const runExecutor = async (
  base: OutcomeBase,
  alignment: AlignmentOk,
  item: ModelWorkItem,
  executor: GenerationExecutor
): Promise<GenerateOutcome> => {
  const startedAt = performance.now();

  let raced:
    | Awaited<ReturnType<typeof raceDeadline<ExecuteResult>>>
    | { readonly elapsedMs: number; readonly threw: true };
  try {
    raced = await raceDeadline(
      async (signal) =>
        await executor.execute({
          alignment,
          imagePath: imagePathFor(item),
          signal,
        }),
      item.deadlineAt,
      item.timeoutFallbackMs
    );
  } catch {
    // Backstop only — `GenerationExecutor.execute` is documented never to
    // throw (it mirrors `bench-core`'s `ExecuteResult` contract), same as
    // `bench-core/execute.ts`'s own try/catch backstop around the client.
    raced = { elapsedMs: performance.now() - startedAt, threw: true };
  }

  if ("threw" in raced) {
    return failureOutcome(base, "HTTP_5XX", alignment.body, {
      downloadMs: null,
      providerMs: null,
      totalMs: raced.elapsedMs,
    });
  }

  if (raced.timedOut) {
    return failureOutcome(base, "TIMEOUT", alignment.body, {
      downloadMs: null,
      providerMs: null,
      totalMs: raced.elapsedMs,
    });
  }

  const result = raced.value;
  if (!result.ok) {
    return failureOutcome(base, result.errorCode, alignment.body, {
      downloadMs: result.downloadMs,
      providerMs: result.providerMs,
      totalMs: result.totalMs,
    });
  }

  return {
    ...base,
    bytes: result.bytes,
    coercedParams: alignment.coerced.map((entry) => entry.param),
    contentType: result.contentType,
    // Cost refinement from returned megapixels is out of scope for this
    // phase's orchestration wiring (`BRIEF.md` rule 9: unknown stays
    // distinguishable from zero until that lands).
    costRefinedMicros: null,
    downloadMs: result.downloadMs,
    droppedParams: alignment.dropped.map((entry) => entry.param),
    falRequestId: result.falRequestId,
    height: result.height,
    providerMs: result.providerMs,
    requestBody: alignment.body,
    seedReturned: result.seedReturned,
    seedSent: alignment.seedSent,
    status: "ok",
    totalMs: result.totalMs,
    width: result.width,
  };
};

const spanMetadataFor = (outcome: GenerateOutcome): Record<string, unknown> =>
  outcome.status === "ok"
    ? {
        "bench.download_ms": outcome.downloadMs,
        "bench.dropped_params":
          outcome.droppedParams.length === 0
            ? undefined
            : outcome.droppedParams,
        "bench.height": outcome.height ?? undefined,
        "bench.model": outcome.alias,
        "bench.provider_ms": outcome.providerMs,
        "bench.queue_polled": outcome.usesQueue,
        "bench.sample_index": outcome.sampleIndex,
        "bench.width": outcome.width ?? undefined,
      }
    : {
        "bench.error.code": outcome.errorCode,
        "bench.model": outcome.alias,
        "bench.queue_polled": outcome.usesQueue,
        "bench.sample_index": outcome.sampleIndex,
      };

export const createGenerateStep = (executor: GenerationExecutor) =>
  createStep({
    description:
      "Run one model's one attempt through the injected GenerationExecutor; never throws.",
    execute: async ({ inputData: item, tracingContext }) => {
      const span = tracingContext?.currentSpan?.createChildSpan({
        input: { sampleIndex: item.sampleIndex },
        name: "bench.generate",
        type: SpanType.GENERIC,
      });

      const outcome = await runAttempt(item, executor);
      span?.end({
        metadata: buildSafeBenchAttributes(spanMetadataFor(outcome)),
      });
      return outcome;
    },
    id: "generate",
    inputSchema: ModelWorkItemSchema,
    outputSchema: GenerateOutcomeSchema,
    retries: 0,
  });
