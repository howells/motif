/**
 * The registered Mastra instance for the benchmark harness.
 *
 * Unlike `@desk/mastra` (deliberately storage-less, in-process — see
 * `docs/arc/bench/BRIEF.md` precedent table), this package attaches a real
 * `PostgresStore` with `schemaName: "mastra"`: benchmark runs take
 * 15–25 minutes and cost real money, so `mastra_workflow_snapshot` /
 * `mastra_ai_spans` need to survive a dev-server restart
 * (`listActiveWorkflowRuns()` / `restart()`) and be inspectable from Studio.
 *
 * `createMastraPool` (`@howells/neon/mastra`) — never a hand-rolled `pg.Pool`
 * — clamps `max` to >= 2 because a single-client pool deadlocks `@mastra/pg`
 * batch writes. Constructing the pool does not connect to Postgres; nothing
 * in this module opens a connection at import time (`BRIEF.md`, this phase:
 * "there is no provisioned DB — do not run migrations or connect").
 */
import { defineMastraConfig } from "@howells/mastra/config";
import { createMastraPool } from "@howells/neon/mastra";
import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { requireServerEnv } from "@motif/bench-env/server";

import { logger, observability } from "./observability";
import { benchmarkRunWorkflow } from "./workflows/benchmark-run";

export const mastra = new Mastra(
  defineMastraConfig({
    logger,
    observability,
    serviceName: "motif-bench",
    storage: new PostgresStore({
      id: "motif-bench-mastra-storage",
      pool: createMastraPool({ url: requireServerEnv("DATABASE_URL") }),
      schemaName: "mastra",
    }),
    workflows: {
      "benchmark-run": benchmarkRunWorkflow,
    },
  })
);
