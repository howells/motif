import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  benchJudgments as rootBenchJudgments,
  benchManualRatings as rootBenchManualRatings,
  benchRuns as rootBenchRuns,
  benchSamples as rootBenchSamples,
} from "./index";
import {
  benchJudgments,
  benchManualRatings,
  benchRuns,
  benchSamples,
} from "./schema";

describe("bench-db schema exports", () => {
  it("re-exports each table by name from the package root (never `export *`)", () => {
    const schemaTables = [
      benchJudgments,
      benchManualRatings,
      benchRuns,
      benchSamples,
    ];
    const rootTables = [
      rootBenchJudgments,
      rootBenchManualRatings,
      rootBenchRuns,
      rootBenchSamples,
    ];

    expect(rootTables).toEqual(schemaTables);
    expect(schemaTables.filter((value) => is(value, PgTable))).toHaveLength(4);
    expect(
      schemaTables.map((table) => getTableConfig(table).name).toSorted()
    ).toEqual([
      "bench_judgments",
      "bench_manual_ratings",
      "bench_runs",
      "bench_samples",
    ]);
  });
});
