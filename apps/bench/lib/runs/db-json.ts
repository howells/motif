/**
 * jsonb (de)serialization for `db-store.ts` — split out purely to keep that
 * file under the repo's line budget. Every jsonb column `db-store.ts` reads
 * is zod-parsed here, not just validated on write, and a couple of columns
 * encode app-level concepts the pushed schema (`packages/bench-db/src/
 * schema.ts`) has no dedicated column for — see each schema's own comment
 * for why. Pure, no I/O, safe as a static top-level import from anywhere.
 */
import { z } from "zod";

import type { JudgeErrorCodeValue, PreviewCoercedParam } from "./types";
import { JUDGE_ERROR_CODES } from "./types";

const JudgeErrorCodeSchema = z.enum(JUDGE_ERROR_CODES);
const JUDGING_STATUSES = ["done", "not-started", "running"] as const;
const JudgingStatusSchema = z.enum(JUDGING_STATUSES);

/** `bench_runs.spec` is the run-level source of truth for the two
 * `RunSpecInput` fields with no dedicated column (`judgeAfter`,
 * `maxEstimatedCostUsd`) plus judging progress, which has no column either
 * — `judgingStatus` lives here as a mutable key, guarded on write (see
 * `db-store.ts`'s `setJudgingStatus`) rather than a schema column, since the
 * already-pushed schema cannot be altered by this change. `deadlineAt`
 * (`./deadline.ts`'s `computeRunDeadlineMs`, ISO string) is the same idea
 * applied to the run-level watchdog deadline — the column comment on
 * `bench_runs.spec` already calls this out: "derived timeout floors ...
 * the run-level source of truth". `.nullable().default(null)` tolerates
 * rows written before this field existed (a missing key parses as `null`,
 * meaning "no deadline to reconcile against" rather than a parse failure). */
export const RunSpecJsonSchema = z.object({
  deadlineAt: z.string().nullable().default(null),
  judgeAfter: z.boolean(),
  judgingStatus: JudgingStatusSchema,
  maxEstimatedCostUsd: z.number(),
});

export const ModelsJsonSchema = z.array(z.string());
export const DroppedParamsJsonSchema = z.array(z.string());

/** `bench_samples.coerced_params` is CHECK-constrained to a JSON *object*
 * (`bench_samples_coerced_params_object_check`), not an array, so the
 * `PreviewCoercedParam[]` shape the app reads/writes everywhere else is
 * stored keyed by `param` name and reassembled here. */
const CoercedParamsJsonSchema = z.record(
  z.string(),
  z.object({ from: z.string(), reason: z.string(), to: z.string() })
);

export const toCoercedParamsJson = (
  coerced: readonly PreviewCoercedParam[]
): Record<string, { from: string; reason: string; to: string }> | null =>
  coerced.length === 0
    ? null
    : Object.fromEntries(
        coerced.map((entry) => [
          entry.param,
          { from: entry.from, reason: entry.reason, to: entry.to },
        ])
      );

export const fromCoercedParamsJson = (
  value: unknown
): readonly PreviewCoercedParam[] => {
  if (value === null || value === undefined) {
    return [];
  }
  const parsed = CoercedParamsJsonSchema.parse(value);
  return Object.entries(parsed).map(([param, entry]) => ({
    param,
    ...entry,
  }));
};

/** `bench_judgments` has no `error_code` column — the closed judge-error
 * vocabulary (`docs/arc/bench/BRIEF.md` rule 2) is recorded as a reserved
 * key inside the NOT NULL `levels` object instead, mutually exclusive with
 * the real per-criterion levels a scored verdict carries. */
const JUDGMENT_ERROR_KEY = "__errorCode";
const LevelsJsonSchema = z.record(z.string(), z.string());

export const toLevelsJson = (verdict: {
  errorCode: JudgeErrorCodeValue | null;
  levels: Record<string, string> | null;
}): Record<string, string> => {
  if (verdict.levels) {
    return { ...verdict.levels };
  }
  if (verdict.errorCode) {
    return { [JUDGMENT_ERROR_KEY]: verdict.errorCode };
  }
  return {};
};

export const fromLevelsJson = (
  value: unknown
): {
  errorCode: JudgeErrorCodeValue | null;
  levels: Record<string, string> | null;
} => {
  const parsed = LevelsJsonSchema.parse(value ?? {});
  const rawErrorCode = parsed[JUDGMENT_ERROR_KEY];
  if (typeof rawErrorCode === "string") {
    return {
      errorCode: JudgeErrorCodeSchema.parse(rawErrorCode),
      levels: null,
    };
  }
  return {
    errorCode: null,
    levels: Object.keys(parsed).length > 0 ? parsed : null,
  };
};

// ---------------------------------------------------------------------------
// Comparative (rank) judgments — the `bench_judgments` row mapping
// ---------------------------------------------------------------------------

/**
 * A comparative pass reuses `bench_judgments` verbatim; no schema change was
 * needed, and the already-pushed schema can express all of it:
 *
 * | column          | carries                                                |
 * |-----------------|--------------------------------------------------------|
 * | `judge_model`   | the vision model id (`google/gemini-2.5-flash`)         |
 * | `rubric_id`     | `RANK_RUBRIC_ID` — distinct from `ROOM_RUBRIC_ID`, so a rank row and an absolute row for the same sample coexist under the `(sample, judge, rubric, version)` unique key instead of overwriting each other |
 * | `overall`       | the Bradley-Terry `rankScore` (`doublePrecision`, nullable — `null` for a sample with zero completed comparisons, never a fabricated 0) |
 * | `levels`        | this sample's pair outcomes plus its standings          |
 * | `status`        | `scored` once a rank score exists, `inconclusive` when the sample completed no comparison |
 * | `cost_micros`   | `null` — fal's `any-llm/vision` reports no billing field |
 *
 * `levels` is CHECK-constrained to a JSON *object* and is read back through
 * `LevelsJsonSchema` (`Record<string, string>`), so every value written here
 * is a **string**: reserved `__`-prefixed keys for the standings, and one
 * entry per opponent keyed by that opponent's sample id with a
 * `win:clear` / `loss:slight` / `tie` value. Sample ids are UUIDs — not
 * prompts, not URLs, not model names — so nothing span-unsafe lands in the
 * column (`docs/arc/bench/BRIEF.md` rules 1 and 3).
 */
const RANK_KEYS = {
  comparisons: "__comparisons",
  losses: "__losses",
  of: "__of",
  rank: "__rank",
  ties: "__ties",
  wins: "__wins",
} as const;

export interface RankLevelsInput {
  readonly comparisons: number;
  readonly losses: number;
  readonly opponents: ReadonlyMap<string, string>;
  readonly rank: number | null;
  readonly rankedCount: number;
  readonly ties: number;
  readonly wins: number;
}

export const toRankLevelsJson = (
  entry: RankLevelsInput
): Record<string, string> => ({
  ...Object.fromEntries(entry.opponents),
  [RANK_KEYS.comparisons]: String(entry.comparisons),
  [RANK_KEYS.losses]: String(entry.losses),
  [RANK_KEYS.of]: String(entry.rankedCount),
  [RANK_KEYS.rank]: entry.rank === null ? "" : String(entry.rank),
  [RANK_KEYS.ties]: String(entry.ties),
  [RANK_KEYS.wins]: String(entry.wins),
});

const positiveIntOrNull = (value: string | undefined): number | null => {
  if (value === undefined || value === "") {
    return null;
  }
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Coverage counts (`__comparisons`/`__wins`/`__losses`/`__ties`) are always
 * present on a row `toRankLevelsJson` wrote (they default to `0`, not an
 * absent key — see `runComparativePass`'s fallback tally), so unlike
 * `__rank` a missing or unparseable value degrades to `0` rather than
 * `null`: "zero comparisons" is itself meaningful data (a sample that never
 * got judged), not a distinct "unknown" state. */
const nonNegativeIntOrZero = (value: string | undefined): number => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/** Reads back the rank standings the UI needs (`rank`/`rankedCount`) plus the
 * pair-coverage counts (`comparisons`/`wins`/`losses`/`ties`) — the BT
 * aggregation writes all six via `toRankLevelsJson`, but until this addition
 * only the first two were ever read back out, so coverage was invisible
 * after the fact even though it was already on the row (team lead's brief).
 * Zod-parsed via the shared `LevelsJsonSchema` per house rule, same as every
 * other jsonb read in this file. A row written before this shape existed, or
 * one that lost its standings, degrades to `null`/`null`/`0`/`0`/`0`/`0` (the
 * "no rank data" state the judge panel already renders for rank/rankedCount)
 * rather than throwing. */
export interface RankStandings {
  readonly comparisons: number;
  readonly losses: number;
  readonly rank: number | null;
  readonly rankedCount: number | null;
  readonly ties: number;
  readonly wins: number;
}

/** The all-null/all-zero `RankStandings` for a judgment row that carries no
 * rank data at all (the absolute rubric, `db-store.ts`'s `toJudgmentRecord`)
 * — a named constant rather than a literal at each call site, partly for
 * `db-store.ts`'s own line budget (`oxlint`'s `max-lines`, already tight
 * enough that this file was split out of it once already). */
export const EMPTY_RANK_STANDINGS: RankStandings = {
  comparisons: 0,
  losses: 0,
  rank: null,
  rankedCount: null,
  ties: 0,
  wins: 0,
};

export const fromRankLevelsJson = (value: unknown): RankStandings => {
  const parsed = LevelsJsonSchema.parse(value ?? {});
  return {
    comparisons: nonNegativeIntOrZero(parsed[RANK_KEYS.comparisons]),
    losses: nonNegativeIntOrZero(parsed[RANK_KEYS.losses]),
    rank: positiveIntOrNull(parsed[RANK_KEYS.rank]),
    rankedCount: positiveIntOrNull(parsed[RANK_KEYS.of]),
    ties: nonNegativeIntOrZero(parsed[RANK_KEYS.ties]),
    wins: nonNegativeIntOrZero(parsed[RANK_KEYS.wins]),
  };
};
