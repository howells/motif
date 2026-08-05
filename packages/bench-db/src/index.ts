// `db()` is deliberately NOT re-exported here: it lives at the
// `@motif/bench-db/client` subpath (see package.json `exports`) so that
// importing the table schemas never drags in `@motif/bench-env/server`'s
// eager env parse.
export {
  benchJudgments,
  benchManualRatings,
  benchRuns,
  benchSamples,
} from "./schema";

// `manual-ratings.ts` takes its `db` as a parameter rather than importing
// `./client` itself, so re-exporting it here carries none of the eager
// env-parse concern above.
export {
  getManualRating,
  listManualRatingsForRun,
  upsertManualRating,
} from "./manual-ratings";
export type {
  BenchDb,
  ManualRating,
  ManualRatingInput,
} from "./manual-ratings";
