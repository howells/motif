/**
 * Unit tests for `db-store.ts`'s pure, DB-free surface. `db-store.ts` itself
 * only ever touches Postgres through a lazily-`await import`ed
 * `@motif/bench-db/client` inside a function body (see the file's header) —
 * nothing here calls `getDb()`, so these tests need no `DATABASE_URL` and
 * make no network call.
 *
 * `buildRunInsertRow` is the exact row `createRun` inserts into `bench_runs`
 * — this is the direct regression test for this phase's bug (`./engine.ts`'s
 * header): `isMock` used to be a hardcoded `false` literal here, independent
 * of what actually generated the samples. Asserting it against both a
 * mock-shaped and a live-shaped `RunEngine` is what makes reintroducing that
 * literal show up as a failing test rather than a silent regression.
 */
import { describe, expect, it } from "vitest";

import { buildRunInsertRow } from "./db-store";
import type { RunEngine } from "./engine";
import type { RunSpecInput } from "./types";

const SPEC: RunSpecInput = {
  aspect: "1:1",
  concurrency: 1,
  judgeAfter: false,
  maxEstimatedCostUsd: 5,
  models: ["flux-fast", "grok-image"],
  prompt: "A well-lit modern living room with a gray sofa.",
  resolution: "1K",
  samplesPerModel: 1,
  seed: null,
};

// oxlint-disable-next-line require-await -- test stubs must return Promises to satisfy RunEngine but do no real work
const unusedBuildAttempt: RunEngine["buildAttempt"] = async () => {
  throw new Error("not exercised by these tests");
};
// oxlint-disable-next-line require-await -- test stubs must return Promises to satisfy RunEngine but do no real work
const unusedBuildJudgment: RunEngine["buildJudgment"] = async () => {
  throw new Error("not exercised by these tests");
};

const MOCK_ENGINE: RunEngine = {
  buildAttempt: unusedBuildAttempt,
  buildJudgment: unusedBuildJudgment,
  isMock: true,
  judgeModelLabel: "mock-vision-judge-v1",
};

const LIVE_ENGINE: RunEngine = {
  buildAttempt: unusedBuildAttempt,
  buildJudgment: unusedBuildJudgment,
  isMock: false,
  judgeModelLabel: "google/gemini-2.5-flash-lite",
};

describe("buildRunInsertRow", () => {
  it("persists isMock: true for a run produced by the mock engine", () => {
    const row = buildRunInsertRow(SPEC, "run-1", new Date(0), MOCK_ENGINE, 0);
    expect(row.isMock).toBe(true);
  });

  it("persists isMock: false for a run produced by the live engine", () => {
    const row = buildRunInsertRow(SPEC, "run-2", new Date(0), LIVE_ENGINE, 0);
    expect(row.isMock).toBe(false);
  });

  it("derives isMock from the engine argument, not from any other field of the row", () => {
    const mockRow = buildRunInsertRow(
      SPEC,
      "same-run-id",
      new Date(0),
      MOCK_ENGINE,
      1_000_000
    );
    const liveRow = buildRunInsertRow(
      SPEC,
      "same-run-id",
      new Date(0),
      LIVE_ENGINE,
      1_000_000
    );
    // Every field except isMock is identical for identical inputs — the only
    // thing that can flip isMock is which engine was passed in.
    expect({ ...mockRow, isMock: undefined }).toEqual({
      ...liveRow,
      isMock: undefined,
    });
    expect(mockRow.isMock).not.toBe(liveRow.isMock);
  });
});
