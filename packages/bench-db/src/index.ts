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
