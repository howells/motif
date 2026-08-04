/**
 * The app's persistence seam. Every route handler under `app/api/**` reads
 * and writes through this module, never through `mock-store.ts` directly —
 * so the day a database is provisioned (`docs/arc/bench/BRIEF.md`'s
 * "Reality check" no longer applies), only this file's implementation
 * changes; every route handler, every React Query hook, and every
 * component stays exactly as written.
 *
 * This phase ships exactly one implementation, `mock-store.ts`, because
 * there is no database to fail over to (the brief: "There is no database
 * and no fal access... Build against the mock executors"). That is a
 * narrower claim than "this file hard-codes mock behavior" — the functions
 * below are the real repository contract; `mock-store.ts` just happens to
 * be the only thing satisfying it yet. A real Postgres-backed
 * implementation is later-phase work, not a redesign of this seam.
 */
import { buildPreview } from "./mock-engine";
import {
  createRun as storeCreateRun,
  getRun as storeGetRun,
  listRuns as storeListRuns,
  sampleBelongsToRun,
  setManualRating as storeSetManualRating,
  startJudging as storeStartJudging,
} from "./mock-store";
import type {
  ManualRatingRecord,
  PreviewResult,
  RunDetail,
  RunSpecInput,
  RunSummary,
} from "./types";

export { CostCapExceededError, MissingPricingError } from "./mock-engine";

/** Dry-run preview: pure alignment + worst-case cost, zero fal calls, zero
 * persistence. Exposed from the repository module for a single import
 * surface even though it never touches the store. */
export const previewRun = (spec: RunSpecInput): PreviewResult =>
  buildPreview(spec);

/** Throws `CostCapExceededError` / `MissingPricingError` — route handlers
 * map both to a 400 with the closed reason, never a raw 500. The cost-cap
 * assertion happens inside `mockStore.createRun` itself, before any sample
 * row is written (`BRIEF.md` rule 5: the cap must throw before any provider
 * work, and here "provider work" is standing up the run at all). */
export const createRun = (spec: RunSpecInput): { runId: string } =>
  storeCreateRun(spec);

export const listRuns = (): RunSummary[] => storeListRuns();

export const getRun = (runId: string): RunDetail | null => storeGetRun(runId);

export const startJudging = (runId: string, judgeModel: string): boolean => {
  const existing = storeGetRun(runId);
  if (!existing) {
    return false;
  }
  storeStartJudging(runId, judgeModel);
  return true;
};

export const setManualRating = (input: {
  note?: string | null;
  sampleId: string;
  stars: number;
}): ManualRatingRecord | null => {
  if (sampleBelongsToRun(input.sampleId) === null) {
    return null;
  }
  return storeSetManualRating(input);
};
