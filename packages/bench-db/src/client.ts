import { createHttpDb } from "@howells/neon/http";
import { requireServerEnv } from "@motif/bench-env/server";

import {
  benchJudgments,
  benchManualRatings,
  benchRuns,
  benchSamples,
} from "./schema";

const schema = { benchJudgments, benchManualRatings, benchRuns, benchSamples };

/**
 * The app's own reads/writes go through the Neon HTTP driver — a single
 * request per query, no pool to manage. Mastra's `PostgresStore` uses its
 * own `createMastraPool` against the pooled endpoint instead (bench-mastra,
 * out of scope here).
 */
export const db = () =>
  createHttpDb({
    schema,
    url: requireServerEnv("DATABASE_URL"),
  });
