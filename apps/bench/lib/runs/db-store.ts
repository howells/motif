/**
 * Postgres-backed implementation of the store contract `mock-store.ts` also
 * satisfies (see `repository.ts`'s header). Same exported surface, async
 * instead of sync, backed by `bench_runs`/`bench_samples`/`bench_judgments`/
 * `bench_manual_ratings` (`packages/bench-db/src/schema.ts`) instead of an
 * in-process `Map`.
 *
 * Unlike `mock-store.ts` (always mock), this store can run either engine:
 * `createRun`/`startJudging` take a `RunEngine` (`./engine.ts`) chosen by
 * `repository.ts`, and call `engine.buildAttempt`/`engine.buildJudgment`
 * instead of reaching into `mock-engine.ts`/`live-engine.ts` directly.
 * `isMock` is persisted as `engine.isMock`, never a literal.
 *
 * Every function that touches Postgres reaches it through a lazy `await
 * import("@motif/bench-db/client")` inside the function body, never a
 * static top-level import: that module pulls in `@motif/bench-env/server`,
 * which parses `process.env` at evaluation and throws when `DATABASE_URL`
 * is unset — a static import anywhere route-reachable would break the
 * zero-env `next build` gate. The table schemas and `manual-ratings.ts`
 * helpers below are safe as static imports — neither touches `./client`.
 */
import { randomUUID } from "node:crypto";

import {
  ALIGNMENT_SCHEMA_VERSION,
  alignParams,
  routeFor,
} from "@motif/bench-core";
import { qualityLevelForScore } from "@motif/bench-core/judge";
import {
  benchJudgments,
  benchRuns,
  benchSamples,
  listManualRatingsForRun,
  upsertManualRating,
} from "@motif/bench-db";
import type { BenchDb, ManualRating } from "@motif/bench-db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  DroppedParamsJsonSchema,
  fromCoercedParamsJson,
  fromLevelsJson,
  ModelsJsonSchema,
  RunSpecJsonSchema,
  toCoercedParamsJson,
} from "./db-json";
// Re-exported below (`export { startJudging }`) so `repository.ts` keeps a
// single import surface for the whole store contract — the judging write
// path lives in `db-store-judging.ts` (split out to stay under the line
// budget). Also used locally by `finalizeRunIfDone`, so this must stay a
// real import, not collapsed into a re-export-only `export ... from`.
// oxlint-disable-next-line unicorn/prefer-export-from -- see above; the binding is used locally in this file, a bare `export ... from` would not create one
import { startJudging } from "./db-store-judging";
import type { RunEngine } from "./engine";
import {
  assertRunWithinCostCap,
  hashUnit,
  simulatedDelayMs,
  usdMicros,
} from "./mock-engine";
import type {
  JudgmentRecord,
  ManualRatingRecord,
  RunDetail,
  RunSpecInput,
  RunSummary,
  SampleRecord,
} from "./types";
import { RUN_STATUSES, SAMPLE_ERROR_CODES, SAMPLE_STATUSES } from "./types";

export { startJudging };

/** No package.json-version-read precedent exists anywhere in this codebase
 * (materialdesk included) — this is a literal constant, re-verified against
 * `@howells/motif-sdk` 1.0.0 per `docs/arc/bench/BRIEF.md`. */
const MOTIF_SDK_VERSION = "1.0.0";

/**
 * The `*_ms` columns are integers, but `performance.now()` deltas are floats
 * (e.g. 898.2271249999994). Postgres rejects those outright: the live engine
 * generated real images and then every settleSample write failed with
 * "invalid input syntax for type integer", leaving samples stuck at pending
 * while the run had already been paid for. Round at the persistence boundary
 * so the integer contract holds whatever the engine hands over — sub-ms
 * precision is meaningless for provider latency.
 */
const msToInt = (value: number | null): number | null =>
  value === null ? null : Math.round(value);

const STALE_AFTER_MS = 10 * 60 * 1000;

/** The only place this module reaches `@motif/bench-db/client` — see the
 * header. Called fresh inside every function that needs a query, never
 * hoisted to module scope. */
const getDb = async (): Promise<BenchDb> => {
  // oxlint-disable-next-line howells/no-runtime-dynamic-imports -- deliberate lazy boundary: @motif/bench-db/client pulls in @motif/bench-env/server, which parses process.env at module evaluation and throws when DATABASE_URL is unset. A static import here would break `next build` with zero environment variables (see this file's header).
  const { db } = await import("@motif/bench-db/client");
  return db();
};

/** Runs a setTimeout-scheduled settle/judge step without letting a failure
 * crash the process — the run simply stays in its current state and shows
 * up as `stale` once `STALE_AFTER_MS` elapses (`toRunSummary` below). */
const runDetached = (label: string, task: () => Promise<void>): void => {
  void (async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[bench db-store] ${label} failed`, error);
    }
  })();
};

// ---------------------------------------------------------------------------
// Read-side row -> wire-model mappers. Every jsonb column is zod-parsed here
// (via `./db-json`), not only on write — a hand-edited or pre-migration row
// must never silently poison a response with unvalidated shape.
// ---------------------------------------------------------------------------

const RunStatusSchema = z.enum(RUN_STATUSES);
const SampleStatusSchema = z.enum(SAMPLE_STATUSES);
const SampleErrorCodeSchema = z.enum(SAMPLE_ERROR_CODES);
const JudgmentStatusSchema = z.enum(["inconclusive", "not-run", "scored"]);

const toRunSummary = (row: typeof benchRuns.$inferSelect): RunSummary => {
  const spec = RunSpecJsonSchema.parse(row.spec);
  const models = ModelsJsonSchema.parse(row.models);
  const status = RunStatusSchema.parse(row.status);
  return {
    aspect: row.aspect,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    concurrency: row.concurrency,
    costActualMicros: row.costActualMicros,
    costEstimatedMicros: row.costEstimatedMicros,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    isMock: row.isMock,
    judgeAfter: spec.judgeAfter,
    judgingStatus: spec.judgingStatus,
    models,
    prompt: row.prompt,
    resolution: row.resolution,
    samplesPerModel: row.samplesPerModel,
    seed: row.seed,
    stale:
      status === "running" &&
      Date.now() - row.updatedAt.getTime() > STALE_AFTER_MS,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    status,
    updatedAt: row.updatedAt.toISOString(),
  };
};

/** `isMock` (the parent run's, not this sample row's) picks the image route:
 * a mock-engine run serves the deterministic synthesized SVG
 * (`/api/mock-image/**`); a live-engine run serves the real downloaded
 * bytes off disk (`/api/image/**`). */
const imageUrlForCompletedSample = (
  row: typeof benchSamples.$inferSelect,
  isMock: boolean
): string => {
  const runId = row.runId;
  const alias = encodeURIComponent(row.modelAlias);
  if (isMock) {
    return `/api/mock-image/${runId}/${alias}/${row.sampleIndex}/${row.width ?? 1024}x${row.height ?? 1024}`;
  }
  return `/api/image/${runId}/${alias}/${row.sampleIndex}`;
};

const toSampleRecord = (
  row: typeof benchSamples.$inferSelect,
  isMock: boolean
): SampleRecord => {
  const status = SampleStatusSchema.parse(row.status);
  const errorCode =
    row.errorCode === null ? null : SampleErrorCodeSchema.parse(row.errorCode);
  const droppedParams =
    row.droppedParams === null
      ? []
      : DroppedParamsJsonSchema.parse(row.droppedParams);

  const imageUrl =
    status === "completed" ? imageUrlForCompletedSample(row, isMock) : null;

  return {
    bytes: row.bytes,
    coercedParams: fromCoercedParamsJson(row.coercedParams),
    contentType: row.contentType,
    costBasis: row.costBasis,
    costEstimatedMicros: row.costEstimatedMicros,
    costRefinedMicros: row.costRefinedMicros,
    createdAt: row.createdAt.toISOString(),
    downloadMs: row.downloadMs,
    droppedParams,
    endpoint: row.endpoint,
    errorCode,
    executionOrdinal: row.executionOrdinal,
    height: row.height,
    id: row.id,
    imageUrl,
    modelAlias: row.modelAlias,
    modelName: row.modelName,
    providerMs: row.providerMs,
    queuePolled: row.queuePolled,
    runId: row.runId,
    sampleIndex: row.sampleIndex,
    seedReturned: row.seedReturned,
    seedSent: row.seedSent,
    status,
    totalMs: row.totalMs,
    width: row.width,
  };
};

const toJudgmentRecord = (
  row: typeof benchJudgments.$inferSelect
): JudgmentRecord => {
  const status = JudgmentStatusSchema.parse(row.status);
  const { errorCode, levels } = fromLevelsJson(row.levels);
  return {
    critique: row.critique,
    errorCode,
    judgeModel: row.judgeModel,
    levels,
    overall: row.overall,
    overallLevel:
      row.overall === null ? null : qualityLevelForScore(row.overall),
    rubricId: row.rubricId,
    rubricVersion: row.rubricVersion,
    sampleId: row.sampleId,
    status,
  };
};

const toManualRatingRecord = (rating: ManualRating): ManualRatingRecord => ({
  note: rating.note,
  sampleId: rating.sampleId,
  stars: rating.stars,
  updatedAt: rating.updatedAt.toISOString(),
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const cohortHashFor = (spec: RunSpecInput): string => {
  const parts = [
    spec.prompt,
    spec.aspect,
    spec.resolution,
    [...spec.models].sort().join(","),
    String(ALIGNMENT_SCHEMA_VERSION),
  ].join("|");
  return hashUnit(parts).toString(36).slice(2);
};

/** The exact row `createRun` inserts into `bench_runs` — a pure function (no
 * `db`, no I/O) so `isMock: engine.isMock` is unit-testable without a live
 * Postgres connection (`db-store.test.ts`) and never a hardcoded literal. */
export const buildRunInsertRow = (
  spec: RunSpecInput,
  runId: string,
  now: Date,
  engine: RunEngine,
  costEstimatedTotalMicros: number
): typeof benchRuns.$inferInsert => ({
  aspect: spec.aspect,
  cohortHash: cohortHashFor(spec),
  concurrency: spec.concurrency,
  costEstimatedMicros: costEstimatedTotalMicros,
  costReservedMicros: costEstimatedTotalMicros,
  id: runId,
  isMock: engine.isMock,
  models: [...spec.models],
  prompt: spec.prompt,
  resolution: spec.resolution,
  samplesPerModel: spec.samplesPerModel,
  sdkVersion: MOTIF_SDK_VERSION,
  seed: spec.seed,
  spec: {
    judgeAfter: spec.judgeAfter,
    judgingStatus: "not-started",
    maxEstimatedCostUsd: spec.maxEstimatedCostUsd,
  },
  startedAt: now,
  status: "running",
});

/** Builds every (model, sample) row up front (status `pending`) in one
 * atomic batch alongside the run row — `db.batch` is the neon-http driver's
 * real multi-statement transaction (`.transaction()` throws "No transactions
 * support in neon-http driver"; `.batch()` is the supported atomic path) —
 * then schedules each sample's settlement against the given `engine`. */
export const createRun = async (
  spec: RunSpecInput,
  engine: RunEngine
): Promise<{ runId: string }> => {
  assertRunWithinCostCap(spec);

  const db = await getDb();
  const runId = randomUUID();
  const now = new Date();

  interface PlannedSample {
    readonly id: string;
    readonly modelAlias: string;
    readonly sampleIndex: number;
    readonly speedP95Seconds: number | null;
  }

  const sampleRows: (typeof benchSamples.$inferInsert)[] = [];
  const planned: PlannedSample[] = [];
  let executionOrdinal = 0;
  let costEstimatedTotalMicros = 0;

  for (const alias of spec.models) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- assertRunWithinCostCap (via routeFor) already rejected any alias without a route before this loop runs; same narrowing mock-store.ts uses
    const route = routeFor(alias as Parameters<typeof routeFor>[0]);
    const costEstimatedMicros = usdMicros(route.pricing.estimatedCostUsd);

    for (
      let sampleIndex = 0;
      sampleIndex < spec.samplesPerModel;
      sampleIndex++
    ) {
      const sampleId = randomUUID();
      const ordinal = executionOrdinal;
      executionOrdinal += 1;
      costEstimatedTotalMicros += costEstimatedMicros;
      sampleRows.push({
        costBasis: route.costBasis,
        costEstimatedMicros,
        endpoint: route.endpoint,
        executionOrdinal: ordinal,
        id: sampleId,
        modelAlias: alias,
        modelName: route.modelName,
        queuePolled: false,
        requestBody: {},
        runId,
        sampleIndex,
        seedSent: spec.seed === null ? null : spec.seed + sampleIndex,
        status: "pending",
      });
      planned.push({
        id: sampleId,
        modelAlias: alias,
        sampleIndex,
        speedP95Seconds: route.speedP95Seconds,
      });
    }
  }

  await db.batch([
    db
      .insert(benchRuns)
      .values(
        buildRunInsertRow(spec, runId, now, engine, costEstimatedTotalMicros)
      ),
    db.insert(benchSamples).values(sampleRows),
  ]);

  for (const sample of planned) {
    // Mock: stagger with a UI-friendly synthetic delay. Live: no synthetic
    // value to stagger with — start as soon as the tick clears (delay 0);
    // the real fal call itself is the "delay".
    const delayMs = engine.isMock
      ? simulatedDelayMs(
          `${runId}:${sample.modelAlias}:${sample.sampleIndex}`,
          sample.speedP95Seconds
        )
      : 0;
    setTimeout(() => {
      runDetached("settleSample", async () => {
        await settleSample(sample.id, runId, engine);
      });
    }, delayMs);
  }

  return { runId };
};

/** Single-writer finalisation: the `UPDATE ... WHERE status = 'running'`
 * guard means a run can only be finalised once even if two settlements race
 * to be "the last sample" — the loser's `UPDATE` matches zero rows and
 * `updated.length === 0` short-circuits before judging is triggered twice. */
const finalizeRunIfDone = async (
  runId: string,
  engine: RunEngine
): Promise<void> => {
  const db = await getDb();
  const samples = await db
    .select({
      costEstimatedMicros: benchSamples.costEstimatedMicros,
      costRefinedMicros: benchSamples.costRefinedMicros,
      status: benchSamples.status,
    })
    .from(benchSamples)
    .where(eq(benchSamples.runId, runId));

  if (samples.length === 0 || samples.some((s) => s.status === "pending")) {
    return; // still generating
  }

  const succeeded = samples.filter((s) => s.status === "completed");
  const newStatus =
    succeeded.length === 0
      ? "failed"
      : succeeded.length === samples.length
        ? "completed"
        : "partial";
  const costActualMicros = succeeded.reduce(
    (sum, s) => sum + (s.costRefinedMicros ?? s.costEstimatedMicros ?? 0),
    0
  );
  const now = new Date();

  const updated = await db
    .update(benchRuns)
    .set({
      completedAt: now,
      costActualMicros,
      status: newStatus,
      updatedAt: now,
    })
    .where(and(eq(benchRuns.id, runId), eq(benchRuns.status, "running")))
    .returning({ spec: benchRuns.spec });

  const finalizedRow = updated[0];
  if (!finalizedRow) {
    return; // another concurrent settlement already finalised this run
  }

  const spec = RunSpecJsonSchema.parse(finalizedRow.spec);
  if (spec.judgeAfter && newStatus !== "failed") {
    await startJudging(runId, engine.judgeModelLabel, engine);
  }
};

const settleSample = async (
  sampleId: string,
  runId: string,
  engine: RunEngine
): Promise<void> => {
  const db = await getDb();
  const [sample] = await db
    .select()
    .from(benchSamples)
    .where(eq(benchSamples.id, sampleId))
    .limit(1);
  const [run] = await db
    .select()
    .from(benchRuns)
    .where(eq(benchRuns.id, runId))
    .limit(1);
  if (!sample || !run) {
    return;
  }

  const benchSpec = {
    aspect: run.aspect,
    outputFormat: null,
    prompt: run.prompt,
    resolution: run.resolution,
    seed: run.seed,
  } as const;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- modelAlias was validated against BENCH_ROUTES_BY_ALIAS in createRun; re-deriving the alignment here (rather than storing the closure) keeps this identical to mock-store.ts's settleSample
  const validatedAlias = sample.modelAlias as Parameters<typeof alignParams>[0];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- aspect/resolution/seed were validated at the API boundary (zod) before createRun stored them
  const validatedSpec = benchSpec as Parameters<typeof alignParams>[1];
  const alignment = alignParams(
    validatedAlias,
    validatedSpec,
    sample.sampleIndex
  );

  if (!alignment.ok) {
    await db
      .update(benchSamples)
      .set({ errorCode: "HTTP_4XX", status: "failed", updatedAt: new Date() })
      .where(eq(benchSamples.id, sampleId));
    await finalizeRunIfDone(runId, engine);
    return;
  }

  const attempt = await engine.buildAttempt({
    alignment,
    costEstimatedMicros: sample.costEstimatedMicros ?? 0,
    runId,
    sampleIndex: sample.sampleIndex,
  });

  await db
    .update(benchSamples)
    .set({
      bytes: attempt.bytes || null,
      coercedParams: toCoercedParamsJson(alignment.coerced),
      contentType: attempt.contentType || null,
      costRefinedMicros: attempt.costRefinedMicros,
      downloadMs: msToInt(attempt.downloadMs),
      droppedParams: [...attempt.droppedParams],
      errorCode: attempt.errorCode,
      falRequestId: attempt.falRequestId,
      height: attempt.height,
      imagePath: attempt.imagePath,
      providerMs: msToInt(attempt.providerMs),
      queuePolled: attempt.queuePolled,
      requestBody: alignment.body,
      seedReturned: attempt.seedReturned,
      status: attempt.ok ? "completed" : "failed",
      totalMs: msToInt(attempt.totalMs),
      updatedAt: new Date(),
      width: attempt.width,
    })
    .where(eq(benchSamples.id, sampleId));

  await finalizeRunIfDone(runId, engine);
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const listRuns = async (): Promise<RunSummary[]> => {
  const db = await getDb();
  const rows = await db
    .select()
    .from(benchRuns)
    .orderBy(desc(benchRuns.createdAt));
  return rows.map(toRunSummary);
};

export const getRun = async (runId: string): Promise<RunDetail | null> => {
  const db = await getDb();
  const [runRow] = await db
    .select()
    .from(benchRuns)
    .where(eq(benchRuns.id, runId))
    .limit(1);
  if (!runRow) {
    return null;
  }

  const sampleRows = await db
    .select()
    .from(benchSamples)
    .where(eq(benchSamples.runId, runId))
    .orderBy(asc(benchSamples.executionOrdinal));

  const sampleIds = sampleRows.map((s) => s.id);
  const judgmentRows =
    sampleIds.length === 0
      ? []
      : await db
          .select()
          .from(benchJudgments)
          .where(inArray(benchJudgments.sampleId, sampleIds));

  const manualRatingRows = await listManualRatingsForRun(db, runId);

  return {
    judgments: judgmentRows.map(toJudgmentRecord),
    manualRatings: manualRatingRows.map(toManualRatingRecord),
    run: toRunSummary(runRow),
    samples: sampleRows.map((row) => toSampleRecord(row, runRow.isMock)),
  };
};

export const setManualRating = async (input: {
  note?: string | null;
  sampleId: string;
  stars: number;
}): Promise<ManualRatingRecord> => {
  const db = await getDb();
  const rating = await upsertManualRating(db, {
    note: input.note ?? null,
    sampleId: input.sampleId,
    stars: input.stars,
  });
  return toManualRatingRecord(rating);
};

/** Backs `app/api/image/[runId]/[alias]/[sampleIndex]/route.ts`. `null` when
 * there is no real file to serve: no matching completed sample, or a
 * completed sample with no `imagePath` (a mock-engine sample in Postgres). */
export const getSampleImage = async (
  runId: string,
  modelAlias: string,
  sampleIndex: number
): Promise<{ contentType: string | null; imagePath: string } | null> => {
  const db = await getDb();
  const [sample] = await db
    .select({
      contentType: benchSamples.contentType,
      imagePath: benchSamples.imagePath,
    })
    .from(benchSamples)
    .where(
      and(
        eq(benchSamples.runId, runId),
        eq(benchSamples.modelAlias, modelAlias),
        eq(benchSamples.sampleIndex, sampleIndex),
        eq(benchSamples.status, "completed")
      )
    )
    .limit(1);
  if (!sample || sample.imagePath === null) {
    return null;
  }
  return { contentType: sample.contentType, imagePath: sample.imagePath };
};

export const sampleBelongsToRun = async (
  sampleId: string
): Promise<string | null> => {
  const db = await getDb();
  const [row] = await db
    .select({ runId: benchSamples.runId })
    .from(benchSamples)
    .where(eq(benchSamples.id, sampleId))
    .limit(1);
  return row?.runId ?? null;
};
