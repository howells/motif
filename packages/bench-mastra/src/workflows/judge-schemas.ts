/**
 * Zod schemas for the `judge-run` workflow graph — same rationale as
 * `./schemas.ts`: Mastra validates every step boundary against these, and
 * (once `PostgresStore` is attached) serializes them into the workflow
 * snapshot.
 *
 * These mirror `@motif/bench-core/judge`'s `QualityLevel` /
 * `ROOM_RUBRIC_CRITERIA` / `JudgmentResult` shapes closely, but are defined
 * independently rather than imported — same house style as
 * `ExecuteErrorCodeSchema` in `./schemas.ts` mirroring `bench-core/execute
 * .ts`'s `ExecuteErrorCode`: these are small, closed vocabularies with no
 * realistic drift risk, and duplicating them keeps this package's workflow
 * schemas free of a value-import from `@motif/bench-core/judge` (whose
 * top-level module reads the filesystem, the same reason `./schemas.ts`
 * never value-imports from `@motif/bench-core/execute` either).
 */
import { z } from "zod";

/** Same four ordinal levels as `bench-core/judge.ts`'s `QualityLevel`. */
export const QualityLevelSchema = z.enum([
  "competent",
  "editorial",
  "slop",
  "stock",
]);

/** Same six criteria, alphabetical, as `bench-core/judge.ts`'s
 * `ROOM_RUBRIC_CRITERIA`. */
export const RoomJudgeLevelsSchema = z.object({
  artifacts: QualityLevelSchema,
  lightingCoherence: QualityLevelSchema,
  materialFidelity: QualityLevelSchema,
  photorealism: QualityLevelSchema,
  promptAdherence: QualityLevelSchema,
  spatialPlausibility: QualityLevelSchema,
});

/** Same closed vocabulary as `bench-core/judge.ts`'s `JudgeErrorCode`. */
export const JudgeErrorCodeSchema = z.enum([
  "IMAGE_READ_FAILED",
  "INVALID_VERDICT",
  "JUDGE_UNAVAILABLE",
  "TIMEOUT",
]);

/**
 * The whole judge-run request. `concurrency` defaults to 4 (the team lead's
 * brief: `.foreach(judgeOne, { concurrency: 4 })`) — judging is read-only
 * against already-generated samples, so it carries none of `benchmark-run`'s
 * "fastest model must be measured at concurrency 1" concern. `judgeModel` is
 * provenance only (`bench_judgments.judge_model`) — which vision model did
 * the judging — never sent to the judge model itself, and never anything
 * that could identify a *generation* model or alias.
 */
export const JudgeRunSpecSchema = z.object({
  concurrency: z.number().int().min(1).default(4),
  isMock: z.boolean().default(true),
  judgeModel: z.string().min(1),
  runId: z.string().min(1),
});
export type JudgeRunSpec = z.infer<typeof JudgeRunSpecSchema>;

/**
 * One sample to judge — `loadSamples`'s output array element and `judgeOne`'s
 * input. Deliberately carries no model alias or model name: the fields here
 * are exactly what `judgeSample` (`@motif/bench-core/judge`) is allowed to
 * see (`imagePath`, `prompt`), plus the bookkeeping (`sampleId`, `runId`,
 * `judgeModel`) `judgeOne` and `finalizeJudging` need to route and persist
 * the result — none of which reaches the judge model itself.
 */
export const SampleToJudgeSchema = z.object({
  imagePath: z.string().min(1),
  judgeModel: z.string().min(1),
  prompt: z.string().min(1),
  runId: z.string().min(1),
  sampleId: z.string().min(1),
});
export type SampleToJudge = z.infer<typeof SampleToJudgeSchema>;

const JudgeOutcomeBaseSchema = z.object({
  judgeModel: z.string(),
  runId: z.string(),
  sampleId: z.string(),
});

/**
 * `judgeOne`'s output — a discriminated result, never a thrown error (same
 * error-as-data discipline as `benchmark-run`'s `GenerateOutcomeSchema`): one
 * inconclusive judgment must not fail the whole `.foreach` batch.
 */
export const JudgeOutcomeSchema = z.discriminatedUnion("status", [
  JudgeOutcomeBaseSchema.extend({
    critique: z.string(),
    levels: RoomJudgeLevelsSchema,
    overall: z.number(),
    overallLevel: QualityLevelSchema,
    rubricId: z.string(),
    rubricVersion: z.number().int(),
    status: z.literal("scored"),
  }),
  JudgeOutcomeBaseSchema.extend({
    errorCode: JudgeErrorCodeSchema,
    status: z.literal("inconclusive"),
  }),
]);
export type JudgeOutcome = z.infer<typeof JudgeOutcomeSchema>;

/** `finalizeJudging`'s output — the whole workflow's output. */
export const JudgeRunOutcomeSchema = z.object({
  inconclusiveCount: z.number().int().nonnegative(),
  isMock: z.boolean(),
  meanOverall: z.number().nullable(),
  runId: z.string(),
  scoredCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
});
export type JudgeRunOutcome = z.infer<typeof JudgeRunOutcomeSchema>;
