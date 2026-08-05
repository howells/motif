/**
 * Wire/read-model types for the bench-web app's own persistence layer.
 *
 * Field names deliberately mirror `@motif/bench-db`'s `bench_runs` /
 * `bench_samples` / `bench_judgments` / `bench_manual_ratings` columns
 * (`packages/bench-db/src/schema.ts`) — the shape a real Postgres-backed
 * repository would return is the shape defined here, so swapping
 * `mock-repository.ts` for a real one (once a database is provisioned,
 * `docs/arc/bench/BRIEF.md`'s "Reality check") changes nothing above the
 * repository seam. Dates are ISO strings, not `Date` — this module crosses
 * the client/server boundary via React Query's JSON transport.
 */
import type { BenchAspect } from "@/lib/aspect";

export const RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const SAMPLE_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

/** Closed error vocabulary — identical to `@motif/bench-core/execute`'s
 * `ExecuteErrorCode` (`BRIEF.md` rule 2). Duplicated as a literal union
 * rather than value-imported for the same reason `bench-mastra`'s workflow
 * schemas duplicate it: this module must stay importable from the client
 * bundle, and `bench-core/execute.ts` pulls in `node:fs`/`node:crypto`. */
export const SAMPLE_ERROR_CODES = [
  "TIMEOUT",
  "RATE_LIMITED",
  "HTTP_4XX",
  "HTTP_5XX",
  "SAFETY",
  "NO_IMAGE",
  "DOWNLOAD_FAILED",
  "INTERRUPTED",
] as const;
export type SampleErrorCode = (typeof SAMPLE_ERROR_CODES)[number];

export const JUDGE_ERROR_CODES = [
  "IMAGE_READ_FAILED",
  "INVALID_VERDICT",
  "JUDGE_UNAVAILABLE",
  "TIMEOUT",
] as const;
export type JudgeErrorCodeValue = (typeof JUDGE_ERROR_CODES)[number];

export const BENCH_OUTPUT_FORMATS = ["jpeg", "png", "webp"] as const;
export type BenchOutputFormat = (typeof BENCH_OUTPUT_FORMATS)[number];

export interface RunSpecInput {
  readonly aspect: BenchAspect;
  readonly concurrency: number;
  readonly judgeAfter: boolean;
  readonly maxEstimatedCostUsd: number;
  readonly models: readonly string[];
  /** Requested container format, standardised across every model in the run.
   * `null` means "whatever each model returns by default" — the honest
   * pre-existing behaviour. 17 of 24 models accept it; the other 7 report it
   * as a dropped param, which is the comparison this tool exists to surface. */
  readonly outputFormat: BenchOutputFormat | null;
  readonly prompt: string;
  readonly resolution: "0.5K" | "1K" | "2K" | "4K";
  readonly samplesPerModel: number;
  readonly seed: number | null;
}

export interface PreviewCoercedParam {
  readonly from: string;
  readonly param: string;
  readonly reason: string;
  readonly to: string;
}

export interface PreviewDroppedParam {
  readonly param: string;
  readonly reason: string;
}

export interface PreviewModelRow {
  readonly alias: string;
  readonly coerced: readonly PreviewCoercedParam[];
  readonly dropped: readonly PreviewDroppedParam[];
  readonly endpoint: string | null;
  readonly errorMessage: string | null;
  readonly modelName: string;
  readonly ok: boolean;
  readonly speedP95Seconds: number | null;
  readonly usesQueue: boolean;
  readonly worstCaseCostUsd: number;
}

export interface PreviewResult {
  readonly aspect: BenchAspect;
  readonly aspectIsUniform: boolean;
  readonly failedCount: number;
  readonly models: readonly PreviewModelRow[];
  readonly totalWorstCaseCostUsd: number;
}

/** Run-level judging progress — distinct from any one sample's
 * `JudgmentStatus`. Drives the "Judging…" banner and lets the run page tell
 * "nobody asked for judging yet" apart from "judging is in flight" apart
 * from "every completed sample has a judgment (or a `not-run` reason)". */
export type JudgingStatus = "done" | "not-started" | "running";

export interface RunSummary {
  readonly aspect: string;
  readonly completedAt: string | null;
  readonly concurrency: number;
  readonly costActualMicros: number | null;
  readonly costEstimatedMicros: number;
  readonly createdAt: string;
  readonly id: string;
  readonly isMock: boolean;
  readonly judgeAfter: boolean;
  readonly judgingStatus: JudgingStatus;
  readonly models: readonly string[];
  /** What the run *asked* for. Per-model outcomes (kept, dropped) live on
   * each sample's `droppedParams`; this is the request. */
  readonly outputFormat: BenchOutputFormat | null;
  readonly prompt: string;
  readonly resolution: string;
  readonly samplesPerModel: number;
  readonly seed: number | null;
  readonly stale: boolean;
  readonly startedAt: string | null;
  readonly status: RunStatus;
  readonly updatedAt: string;
}

export interface SampleRecord {
  readonly bytes: number | null;
  readonly coercedParams: readonly PreviewCoercedParam[];
  readonly contentType: string | null;
  readonly costBasis: string | null;
  readonly costEstimatedMicros: number | null;
  readonly costRefinedMicros: number | null;
  readonly createdAt: string;
  readonly downloadMs: number | null;
  readonly droppedParams: readonly string[];
  readonly endpoint: string;
  readonly errorCode: SampleErrorCode | null;
  readonly executionOrdinal: number;
  readonly height: number | null;
  readonly id: string;
  readonly imageUrl: string | null;
  readonly modelAlias: string;
  readonly modelName: string | null;
  readonly providerMs: number | null;
  readonly queuePolled: boolean;
  readonly runId: string;
  readonly sampleIndex: number;
  readonly seedReturned: number | null;
  readonly seedSent: number | null;
  readonly status: SampleStatus;
  readonly totalMs: number | null;
  readonly width: number | null;
}

export type JudgmentStatus = "inconclusive" | "not-run" | "scored";

export interface JudgmentRecord {
  /** Pair coverage from the Bradley-Terry aggregation — `0` on an absolute
   * judgment or a comparative sample that completed no comparison, never
   * `null` (unlike `rank`): "zero comparisons" is itself meaningful, not an
   * unknown state (`db-json.ts`'s `fromRankLevelsJson`). */
  readonly comparisons: number;
  readonly critique: string | null;
  readonly errorCode: JudgeErrorCodeValue | null;
  readonly judgeModel: string;
  readonly levels: Record<string, string> | null;
  /** See `comparisons`. */
  readonly losses: number;
  /** `overall` means one of two things and `rubricId` is what says which: for
   * the absolute rubric it is the weighted geometric mean of the six
   * criterion levels; for the comparative rubric it is the Bradley-Terry
   * `rankScore`, normalised so the mean of the ranked field is 1.0. */
  readonly overall: number | null;
  /** Only ever populated for the absolute rubric — a rank score is not a
   * quality *level*, and bucketing one into `editorial`/`competent`/… would
   * be a category error. */
  readonly overallLevel: string | null;
  /** 1-based position in the comparative pass, `null` on an absolute
   * judgment or on a sample that completed no comparison. */
  readonly rank: number | null;
  /** How many samples the rank is out of ("#1 of 24"). */
  readonly rankedCount: number | null;
  readonly rubricId: string;
  readonly rubricVersion: number;
  readonly sampleId: string;
  readonly status: JudgmentStatus;
  /** See `comparisons`. */
  readonly ties: number;
  /** See `comparisons`. */
  readonly wins: number;
}

export interface ManualRatingRecord {
  readonly note: string | null;
  readonly sampleId: string;
  readonly stars: number;
  readonly updatedAt: string;
}

export interface RunDetail {
  readonly judgments: readonly JudgmentRecord[];
  readonly manualRatings: readonly ManualRatingRecord[];
  readonly run: RunSummary;
  readonly samples: readonly SampleRecord[];
}
