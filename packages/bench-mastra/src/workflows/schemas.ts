/**
 * Zod schemas for the `benchmark-run` workflow graph. Mastra validates step
 * input/output against these at every boundary and (once `PostgresStore` is
 * attached in `src/index.ts`) serializes them into the workflow snapshot, so
 * every shape that crosses a step boundary needs a schema here — a plain
 * `bench-core` TypeScript interface is not enough on its own.
 *
 * These mirror `@motif/bench-core`'s `BenchSpec` / `AlignmentResult` /
 * `bench-db`'s `benchSamples` columns closely enough that a future
 * `bench-db`-backed `PersistExecutor` can map a `PersistSampleInput` (see
 * `../executors.ts`) straight onto a row, but they are defined independently
 * — this package must not import `@motif/bench-db` (`BRIEF.md`: no real
 * database this phase).
 */
import type { AlignmentResult } from "@motif/bench-core";
import { z } from "zod";

/** Same seven aspects `BenchSpec` accepts (`bench-core/align-params.ts`). */
export const AspectSchema = z.enum([
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
]);

export const ResolutionSchema = z.enum(["0.5K", "1K", "2K", "4K"]);

export const OutputFormatSchema = z.enum(["jpeg", "png", "webp"]).nullable();

/** Closed error vocabulary (`BRIEF.md` rule 2) — identical to
 * `bench-core/execute.ts`'s `ExecuteErrorCode`. */
export const ExecuteErrorCodeSchema = z.enum([
  "TIMEOUT",
  "RATE_LIMITED",
  "HTTP_4XX",
  "HTTP_5XX",
  "SAFETY",
  "NO_IMAGE",
  "DOWNLOAD_FAILED",
  "INTERRUPTED",
]);

/**
 * The whole-run request. `concurrency` defaults to 1 — `BRIEF.md` rule 7:
 * "Fastest model" is a headline answer, so the default must be the
 * trustworthy one. `isMock` defaults to `true`: this phase ships no real
 * executor, so every run this package can produce is a mock run
 * (`BRIEF.md` rule 6 — flagged so fake data cannot pollute longitudinal
 * stats once a real executor exists).
 */
export const BenchRunSpecSchema = z.object({
  aspect: AspectSchema.default("1:1"),
  concurrency: z.number().int().min(1).default(1),
  isMock: z.boolean().default(true),
  maxEstimatedCostUsd: z.number().positive(),
  models: z.array(z.string().min(1)).min(1),
  outputFormat: OutputFormatSchema.default(null),
  prompt: z.string().min(1),
  resolution: ResolutionSchema.default("1K"),
  runId: z.string().min(1),
  samplesPerModel: z.number().int().min(1).default(1),
  seed: z.number().int().nullable().default(null),
});
export type BenchRunSpec = z.infer<typeof BenchRunSpecSchema>;

/**
 * `bench-core`'s `alignParams` output, carried on a work item verbatim — this
 * is what a real `GenerationExecutor` needs (`alignment.options`, the
 * `GenerateOptions` fal's client actually sends) so it is kept whole rather
 * than trimmed to the few fields this package's own steps read.
 *
 * `z.custom` (not a field-by-field schema) deliberately does not re-derive
 * `AlignmentResult`'s shape — `GenerateOptions` alone has ~30 optional
 * fields, and mirroring it here would recreate the exact mirror-drift
 * `BRIEF.md` warns about (`align-params.ts`'s own drift-guard test already
 * keeps `alignParams` honest against `buildGenerateBody`). This value is
 * never user input — it is produced by `planRun` calling `alignParams`
 * one step earlier — so a runtime shape check, not full validation, is
 * correct here.
 */
export const AlignmentResultSchema = z.custom<AlignmentResult>(
  (value) => typeof value === "object" && value !== null && "ok" in value,
  { message: "Expected an AlignmentResult (bench-core/align-params.ts)" }
);

/**
 * One `(model, sample)` unit of work — `planRun`'s output array element and
 * the nested `runOneModel` workflow's input. Alignment is resolved eagerly in
 * `planRun` (pure, synchronous, no I/O) so `generate` only ever has to branch
 * on `alignment.ok`, never call `alignParams` itself.
 */
export const ModelWorkItemSchema = z.object({
  alias: z.string(),
  alignment: AlignmentResultSchema,
  costBasis: z.string(),
  costEstimatedMicros: z.number().int().nonnegative(),
  /** Absolute epoch-ms shared by every item in the run — the run-level
   * deadline every `generate` step races (materialdesk's `withDeadline`
   * pattern; `../constants.ts`). */
  deadlineAt: z.number(),
  endpoint: z.string(),
  executionOrdinal: z.number().int().nonnegative(),
  modelName: z.string(),
  runId: z.string(),
  sampleIndex: z.number().int().nonnegative(),
  /** This item's own fallback cap, used only if `deadlineAt` is somehow
   * absent by the time `generate` runs — see `withDeadline` in
   * `../deadline.ts`. */
  timeoutFallbackMs: z.number().int().positive(),
  usesQueue: z.boolean(),
});
export type ModelWorkItem = z.infer<typeof ModelWorkItemSchema>;

const GenerateBaseSchema = z.object({
  alias: z.string(),
  costBasis: z.string(),
  costEstimatedMicros: z.number().int().nonnegative(),
  endpoint: z.string(),
  executionOrdinal: z.number().int().nonnegative(),
  modelName: z.string(),
  requestBody: z.record(z.string(), z.unknown()),
  runId: z.string(),
  sampleIndex: z.number().int().nonnegative(),
  usesQueue: z.boolean(),
});

/**
 * `generate`'s output — a discriminated result, never a thrown error
 * (`BRIEF.md`: "error-as-data at the step boundary" so one dead model cannot
 * fail the other 22). `status: "failed"` covers both an `alignParams`
 * rejection and an execution failure; `errorCode` is always one of the eight
 * closed values either way (an alignment failure maps to `HTTP_4XX` — the
 * request itself was invalid, the closest of the eight to "we could not
 * build a valid request").
 */
export const GenerateOutcomeSchema = z.discriminatedUnion("status", [
  GenerateBaseSchema.extend({
    bytes: z.number().int().nonnegative(),
    contentType: z.string().nullable(),
    coercedParams: z.array(z.string()),
    costRefinedMicros: z.number().int().nonnegative().nullable(),
    downloadMs: z.number().nonnegative(),
    droppedParams: z.array(z.string()),
    falRequestId: z.string().nullable(),
    height: z.number().int().positive().nullable(),
    providerMs: z.number().nonnegative(),
    seedReturned: z.number().int().nullable(),
    seedSent: z.number().int().nullable(),
    status: z.literal("ok"),
    totalMs: z.number().nonnegative(),
    width: z.number().int().positive().nullable(),
  }),
  GenerateBaseSchema.extend({
    downloadMs: z.number().nonnegative().nullable(),
    errorCode: ExecuteErrorCodeSchema,
    providerMs: z.number().nonnegative().nullable(),
    status: z.literal("failed"),
    totalMs: z.number().nonnegative(),
  }),
]);
export type GenerateOutcome = z.infer<typeof GenerateOutcomeSchema>;

/** `persist`'s output — the nested `runOneModel` workflow's output and one
 * element of `.foreach`'s result array. */
export const PersistOutcomeSchema = z.object({
  alias: z.string(),
  costEstimatedMicros: z.number().int().nonnegative(),
  costRefinedMicros: z.number().int().nonnegative().nullable(),
  downloadMs: z.number().nonnegative().nullable(),
  errorCode: ExecuteErrorCodeSchema.nullable(),
  executionOrdinal: z.number().int().nonnegative(),
  providerMs: z.number().nonnegative().nullable(),
  runId: z.string(),
  sampleId: z.string(),
  sampleIndex: z.number().int().nonnegative(),
  status: z.enum(["completed", "failed"]),
  totalMs: z.number().nonnegative(),
});
export type PersistOutcome = z.infer<typeof PersistOutcomeSchema>;

const PhaseTimingSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  meanMs: z.number().nullable(),
  p50Ms: z.number().nullable(),
  p95Ms: z.number().nullable(),
});

const CostAggregateSchema = z.object({
  knownCount: z.number().int().nonnegative(),
  totalKnownMicros: z.number().int().nonnegative().nullable(),
  unknownCount: z.number().int().nonnegative(),
});

const ModelAggregateSchema = z.object({
  cost: CostAggregateSchema,
  download: PhaseTimingSummarySchema,
  failedCount: z.number().int().nonnegative(),
  modelAlias: z.string(),
  provider: PhaseTimingSummarySchema,
  succeededCount: z.number().int().nonnegative(),
  total: PhaseTimingSummarySchema,
  totalCount: z.number().int().nonnegative(),
});

/** `finalizeRun`'s output — the whole workflow's output. */
export const RunOutcomeSchema = z.object({
  costEstimatedMicros: z.number().int().nonnegative(),
  deadlineAt: z.number(),
  isMock: z.boolean(),
  models: z.array(ModelAggregateSchema),
  runId: z.string(),
  status: z.enum(["completed", "partial", "failed"]),
  timeoutFloorMs: z.number().int().positive(),
});
export type RunOutcome = z.infer<typeof RunOutcomeSchema>;
