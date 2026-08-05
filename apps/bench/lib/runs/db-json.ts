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
