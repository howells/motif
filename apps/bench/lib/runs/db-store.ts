/**
 * Postgres-backed implementation of the store contract mock-store.ts also
 * satisfies (see `repository.ts`'s header) — the composition root selects
 * between the two based on `BENCH_MOCK`. Same exported surface as
 * `mock-store.ts` (`createRun`, `getRun`, `listRuns`, `startJudging`,
 * `setManualRating`, `sampleBelongsToRun`), async instead of sync, backed by
 * `bench_runs` / `bench_samples` / `bench_judgments` / `bench_manual_ratings`
 * (`packages/bench-db/src/schema.ts`) instead of an in-process `Map`.
 *
 * Generation and judging stay entirely on the mock engine
 * (`./mock-engine.ts`) — no live fal call, no vision-model call — this file
 * only changes *where the same synthetic results land*. Every function that
 * touches Postgres reaches it through a lazy `await import("@motif/bench-db
 * /client")` inside the function body, never a static top-level import:
 * `@motif/bench-db/client` pulls in `@motif/bench-env/server`, which parses
 * `process.env` at module evaluation and throws when `DATABASE_URL` is
 * unset. A static import anywhere reachable from a route module would break
 * `next build` with zero environment variables (the acceptance test for
 * this file). The table schemas and `manual-ratings.ts` helpers imported
 * below are safe as static top-level imports — neither touches `./client`.
 */
import { randomUUID } from "node:crypto";

import {
  ALIGNMENT_SCHEMA_VERSION,
  alignParams,
  routeFor,
} from "@motif/bench-core";
import {
  qualityLevelForScore,
  ROOM_RUBRIC_ID,
  ROOM_RUBRIC_VERSION,
} from "@motif/bench-core/judge";
import {
  benchJudgments,
  benchRuns,
  benchSamples,
  listManualRatingsForRun,
  upsertManualRating,
} from "@motif/bench-db";
import type { BenchDb, ManualRating } from "@motif/bench-db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  DroppedParamsJsonSchema,
  fromCoercedParamsJson,
  fromLevelsJson,
  ModelsJsonSchema,
  RunSpecJsonSchema,
  toCoercedParamsJson,
  toLevelsJson,
} from "./db-json";
import {
  assertRunWithinCostCap,
  buildSyntheticAttempt,
  buildSyntheticJudgment,
  hashUnit,
  simulatedDelayMs,
  usdMicros,
} from "./mock-engine";
import type {
  JudgingStatus,
  JudgmentRecord,
  ManualRatingRecord,
  RunDetail,
  RunSpecInput,
  RunSummary,
  SampleRecord,
} from "./types";
import { RUN_STATUSES, SAMPLE_ERROR_CODES, SAMPLE_STATUSES } from "./types";

/** No package.json-version-read precedent exists anywhere in this codebase
 * (materialdesk included) — this is a literal constant, re-verified against
 * `@howells/motif-sdk` 1.0.0 per `docs/arc/bench/BRIEF.md`. */
const MOTIF_SDK_VERSION = "1.0.0";

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

const toSampleRecord = (
  row: typeof benchSamples.$inferSelect
): SampleRecord => {
  const status = SampleStatusSchema.parse(row.status);
  const errorCode =
    row.errorCode === null ? null : SampleErrorCodeSchema.parse(row.errorCode);
  const droppedParams =
    row.droppedParams === null
      ? []
      : DroppedParamsJsonSchema.parse(row.droppedParams);

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
    // Same path-segment convention as mock-store.ts's toSampleRecord — see
    // that file's header for why dimensions travel as a path segment.
    imageUrl:
      status === "completed"
        ? `/api/mock-image/${row.runId}/${encodeURIComponent(row.modelAlias)}/${row.sampleIndex}/${row.width ?? 1024}x${row.height ?? 1024}`
        : null,
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

/** Guarded write of just the `judgingStatus` key inside `spec` — compares
 * the current value in the same statement (`spec ->> 'judgingStatus' =
 * expectedCurrent`) so two racing transitions (e.g. a double click on
 * "Judge this run") can't stomp each other; the loser's `UPDATE` matches
 * zero rows and is a no-op. */
const setJudgingStatus = async (
  db: BenchDb,
  runId: string,
  expectedCurrent: JudgingStatus,
  next: JudgingStatus
): Promise<boolean> => {
  const updated = await db
    .update(benchRuns)
    .set({
      spec: sql`jsonb_set(${benchRuns.spec}, '{judgingStatus}', to_jsonb(${next}::text))`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(benchRuns.id, runId),
        sql`${benchRuns.spec} ->> 'judgingStatus' = ${expectedCurrent}`
      )
    )
    .returning({ id: benchRuns.id });
  return updated.length > 0;
};

/** Builds every (model, sample) row up front (status `pending`) in one
 * atomic batch alongside the run row — `db.batch` is the neon-http driver's
 * real multi-statement transaction (`.transaction()` itself throws "No
 * transactions support in neon-http driver"; `.batch()` is the supported
 * atomic path) — then schedules each sample's synthetic settlement
 * independently, mirroring `mock-store.ts`'s `createRun` shape exactly
 * except every write lands in Postgres instead of a `Map`. */
export const createRun = async (
  spec: RunSpecInput
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
    db.insert(benchRuns).values({
      aspect: spec.aspect,
      cohortHash: cohortHashFor(spec),
      concurrency: spec.concurrency,
      costEstimatedMicros: costEstimatedTotalMicros,
      costReservedMicros: costEstimatedTotalMicros,
      id: runId,
      isMock: false,
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
    }),
    db.insert(benchSamples).values(sampleRows),
  ]);

  for (const sample of planned) {
    const delayMs = simulatedDelayMs(
      `${runId}:${sample.modelAlias}:${sample.sampleIndex}`,
      sample.speedP95Seconds
    );
    setTimeout(() => {
      runDetached("settleSample", async () => {
        await settleSample(sample.id, runId);
      });
    }, delayMs);
  }

  return { runId };
};

/** Single-writer finalisation: the `UPDATE ... WHERE status = 'running'`
 * guard means a run can only be finalised once even if two settlements race
 * to be "the last sample" — the loser's `UPDATE` matches zero rows and
 * `updated.length === 0` short-circuits before judging is triggered twice. */
const finalizeRunIfDone = async (runId: string): Promise<void> => {
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
    await startJudging(runId, "mock-vision-judge-v1");
  }
};

const settleSample = async (sampleId: string, runId: string): Promise<void> => {
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
    await finalizeRunIfDone(runId);
    return;
  }

  const attempt = buildSyntheticAttempt(
    runId,
    alignment,
    sample.costEstimatedMicros ?? 0,
    sample.sampleIndex
  );

  await db
    .update(benchSamples)
    .set({
      bytes: attempt.bytes || null,
      coercedParams: toCoercedParamsJson(alignment.coerced),
      contentType: attempt.contentType || null,
      costRefinedMicros: attempt.costRefinedMicros,
      downloadMs: attempt.downloadMs,
      droppedParams: [...attempt.droppedParams],
      errorCode: attempt.errorCode,
      height: attempt.height,
      providerMs: attempt.providerMs,
      queuePolled: attempt.queuePolled,
      requestBody: alignment.body,
      seedReturned: attempt.seedReturned,
      status: attempt.ok ? "completed" : "failed",
      totalMs: attempt.totalMs,
      updatedAt: new Date(),
      width: attempt.width,
    })
    .where(eq(benchSamples.id, sampleId));

  await finalizeRunIfDone(runId);
};

/** Judges every completed sample of a run that does not already carry a
 * judgment for `(sample, judgeModel, rubricId, rubricVersion)` — the insert
 * below upserts on that exact composite unique constraint
 * (`bench_judgments_sample_judge_rubric_version_unique`), so re-judging
 * replaces the row instead of duplicating it. Mirrors `mock-store.ts`'s
 * `startJudging` staggering. */
export const startJudging = async (
  runId: string,
  judgeModel: string
): Promise<void> => {
  const db = await getDb();
  const [run] = await db
    .select({ spec: benchRuns.spec })
    .from(benchRuns)
    .where(eq(benchRuns.id, runId))
    .limit(1);
  if (!run) {
    return;
  }

  const completedSamples = await db
    .select({ id: benchSamples.id, modelAlias: benchSamples.modelAlias })
    .from(benchSamples)
    .where(
      and(eq(benchSamples.runId, runId), eq(benchSamples.status, "completed"))
    );

  const alreadyJudged =
    completedSamples.length === 0
      ? []
      : await db
          .select({ sampleId: benchJudgments.sampleId })
          .from(benchJudgments)
          .where(
            and(
              inArray(
                benchJudgments.sampleId,
                completedSamples.map((s) => s.id)
              ),
              eq(benchJudgments.judgeModel, judgeModel),
              eq(benchJudgments.rubricId, ROOM_RUBRIC_ID),
              eq(benchJudgments.rubricVersion, ROOM_RUBRIC_VERSION)
            )
          );
  const judgedIds = new Set(alreadyJudged.map((j) => j.sampleId));
  const toJudge = completedSamples.filter((s) => !judgedIds.has(s.id));

  const spec = RunSpecJsonSchema.parse(run.spec);

  if (toJudge.length === 0) {
    if (spec.judgingStatus === "not-started") {
      await setJudgingStatus(db, runId, "not-started", "done");
    }
    return;
  }

  await setJudgingStatus(db, runId, spec.judgingStatus, "running");

  let maxDelayMs = 0;
  for (const sample of toJudge) {
    const delayMs = 250 + hashUnit(`${sample.id}:judge-delay`) * 1800;
    maxDelayMs = Math.max(maxDelayMs, delayMs);
    setTimeout(() => {
      runDetached("judgeOneSample", async () => {
        await judgeOneSample(runId, sample.id, sample.modelAlias, judgeModel);
      });
    }, delayMs);
  }

  setTimeout(() => {
    runDetached("markJudgingDoneIfSettled", async () => {
      await markJudgingDoneIfSettled(runId);
    });
  }, maxDelayMs + 50);
};

const judgeOneSample = async (
  runId: string,
  sampleId: string,
  modelAlias: string,
  judgeModel: string
): Promise<void> => {
  const db = await getDb();
  const verdict = buildSyntheticJudgment(sampleId, modelAlias);
  const levels = toLevelsJson(verdict);

  await db
    .insert(benchJudgments)
    .values({
      critique: verdict.critique,
      id: randomUUID(),
      judgeModel,
      levels,
      overall: verdict.overall,
      rubricId: ROOM_RUBRIC_ID,
      rubricVersion: ROOM_RUBRIC_VERSION,
      sampleId,
      status: verdict.status,
    })
    .onConflictDoUpdate({
      set: {
        critique: verdict.critique,
        levels,
        overall: verdict.overall,
        status: verdict.status,
        updatedAt: new Date(),
      },
      target: [
        benchJudgments.sampleId,
        benchJudgments.judgeModel,
        benchJudgments.rubricId,
        benchJudgments.rubricVersion,
      ],
    });

  await markJudgingDoneIfSettled(runId);
};

const markJudgingDoneIfSettled = async (runId: string): Promise<void> => {
  const db = await getDb();
  const completedSamples = await db
    .select({ id: benchSamples.id })
    .from(benchSamples)
    .where(
      and(eq(benchSamples.runId, runId), eq(benchSamples.status, "completed"))
    );
  if (completedSamples.length === 0) {
    return;
  }

  const judged = await db
    .select({ sampleId: benchJudgments.sampleId })
    .from(benchJudgments)
    .where(
      inArray(
        benchJudgments.sampleId,
        completedSamples.map((s) => s.id)
      )
    );
  const judgedIds = new Set(judged.map((j) => j.sampleId));
  const allJudged = completedSamples.every((s) => judgedIds.has(s.id));
  if (!allJudged) {
    return;
  }

  await setJudgingStatus(db, runId, "running", "done");
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
    samples: sampleRows.map(toSampleRecord),
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
