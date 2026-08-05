/**
 * In-process store backing `mock-repository.ts` — the stand-in for "the
 * app's own tables" (`docs/arc/bench/BRIEF.md`: the results page "polls the
 * app's own tables via React Query") until a database is actually
 * provisioned. A `globalThis` singleton, the same idiom Next apps use for a
 * dev-mode Prisma client, so the store survives this module's own
 * hot-reload in `next dev` — state still resets on a full dev-server
 * restart, which is the one piece of "survives a restart" this phase
 * cannot honor without real persistence (see `repository.ts`'s header).
 *
 * Every write here goes through plain in-memory `Map` mutation, not SQL —
 * but the shape written is exactly `RunSummary`/`SampleRecord`/
 * `JudgmentRecord`/`ManualRatingRecord`, so `mock-repository.ts`'s read side
 * is indistinguishable from a real repository's.
 */
import { randomUUID } from "node:crypto";

import {
  ALIGNMENT_SCHEMA_VERSION,
  alignParams,
  routeFor,
} from "@motif/bench-core";

import { elapsedMsFor } from "./elapsed";
import {
  assertRunWithinCostCap,
  buildSyntheticAttempt,
  buildSyntheticJudgment,
  hashUnit,
  simulatedDelayMs,
  usdMicros,
} from "./mock-engine";
import { runWithConcurrency } from "./pool";
import { planRetry } from "./retry";
import type { RetryResult } from "./retry";
import type {
  JudgingStatus,
  JudgmentRecord,
  ManualRatingRecord,
  PreviewCoercedParam,
  RunDetail,
  RunSpecInput,
  RunStatus,
  RunSummary,
  SampleRecord,
  SampleStatus,
} from "./types";

interface StoredSample {
  bytes: number | null;
  coercedParams: readonly PreviewCoercedParam[];
  contentType: string | null;
  costBasis: string;
  costEstimatedMicros: number;
  costRefinedMicros: number | null;
  createdAt: Date;
  downloadMs: number | null;
  droppedParams: readonly string[];
  endpoint: string;
  errorCode: SampleRecord["errorCode"];
  executionOrdinal: number;
  height: number | null;
  id: string;
  modelAlias: string;
  modelName: string;
  providerMs: number | null;
  queuePolled: boolean;
  runId: string;
  sampleIndex: number;
  seedReturned: number | null;
  seedSent: number | null;
  /** Mirrors `bench_samples.started_at` — see the column comment there.
   * Stamped when a dispatch lane picks the sample up, not when the row was
   * created, so a sample queued behind the concurrency limit does not report
   * its wait as generation time. */
  startedAt: Date | null;
  status: SampleStatus;
  totalMs: number | null;
  width: number | null;
}

interface StoredRun {
  aspect: string;
  cohortHash: string;
  completedAt: Date | null;
  concurrency: number;
  costActualMicros: number | null;
  costEstimatedMicros: number;
  createdAt: Date;
  id: string;
  isMock: true;
  judgeAfter: boolean;
  judgingStatus: JudgingStatus;
  /** Kept so `retrySamples` can hold a partial re-run to the same cap the
   * composer agreed to, exactly as the Postgres store reads it back out of
   * `bench_runs.spec` — the guard must not be weaker here just because this
   * store's money is imaginary. */
  maxEstimatedCostUsd: number;
  models: readonly string[];
  outputFormat: RunSpecInput["outputFormat"];
  prompt: string;
  resolution: string;
  samplesPerModel: number;
  seed: number | null;
  startedAt: Date | null;
  status: RunStatus;
  updatedAt: Date;
}

interface Store {
  judgments: Map<string, JudgmentRecord>; // key: sampleId
  manualRatings: Map<string, ManualRatingRecord>; // key: sampleId
  runs: Map<string, StoredRun>;
  samples: Map<string, StoredSample>; // key: sampleId
}

declare global {
  // eslint-disable-next-line no-var -- module-singleton idiom, see header
  var benchMockStoreSingleton: Store | undefined;
}

const createStore = (): Store => ({
  judgments: new Map(),
  manualRatings: new Map(),
  runs: new Map(),
  samples: new Map(),
});

// oxlint-disable-next-line typescript/no-unnecessary-condition -- globalThis.benchMockStoreSingleton is genuinely undefined on first module evaluation; this is the standard dev-HMR-survival singleton pattern, not a redundant check
const store: Store = globalThis.benchMockStoreSingleton ?? createStore();
globalThis.benchMockStoreSingleton = store;

const STALE_AFTER_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

const toRunSummary = (run: StoredRun): RunSummary => ({
  aspect: run.aspect,
  completedAt: run.completedAt?.toISOString() ?? null,
  concurrency: run.concurrency,
  costActualMicros: run.costActualMicros,
  costEstimatedMicros: run.costEstimatedMicros,
  createdAt: run.createdAt.toISOString(),
  id: run.id,
  isMock: run.isMock,
  judgeAfter: run.judgeAfter,
  judgingStatus: run.judgingStatus,
  models: run.models,
  outputFormat: run.outputFormat,
  prompt: run.prompt,
  resolution: run.resolution,
  samplesPerModel: run.samplesPerModel,
  seed: run.seed,
  stale:
    run.status === "running" &&
    Date.now() - run.updatedAt.getTime() > STALE_AFTER_MS,
  startedAt: run.startedAt?.toISOString() ?? null,
  status: run.status,
  updatedAt: run.updatedAt.toISOString(),
});

const toSampleRecord = (sample: StoredSample): SampleRecord => ({
  bytes: sample.bytes,
  coercedParams: sample.coercedParams,
  contentType: sample.contentType,
  costBasis: sample.costBasis,
  costEstimatedMicros: sample.costEstimatedMicros,
  costRefinedMicros: sample.costRefinedMicros,
  createdAt: sample.createdAt.toISOString(),
  downloadMs: sample.downloadMs,
  droppedParams: sample.droppedParams,
  elapsedMs: elapsedMsFor({
    now: Date.now(),
    startedAt: sample.startedAt,
    status: sample.status,
  }),
  endpoint: sample.endpoint,
  errorCode: sample.errorCode,
  executionOrdinal: sample.executionOrdinal,
  height: sample.height,
  id: sample.id,
  // Dimensions travel as a path segment, never a query string. Next 16 made
  // query strings on local `next/image` sources a build-time opt-in
  // (`images.localPatterns.search`) as an anti-enumeration measure, and that
  // `search` must match EXACTLY — so per-model dimensions cannot be expressed
  // as one pattern. A path segment sidesteps the restriction entirely.
  imageUrl:
    sample.status === "completed"
      ? `/api/mock-image/${sample.runId}/${encodeURIComponent(sample.modelAlias)}/${sample.sampleIndex}/${sample.width ?? 1024}x${sample.height ?? 1024}`
      : null,
  modelAlias: sample.modelAlias,
  modelName: sample.modelName,
  providerMs: sample.providerMs,
  queuePolled: sample.queuePolled,
  runId: sample.runId,
  sampleIndex: sample.sampleIndex,
  seedReturned: sample.seedReturned,
  seedSent: sample.seedSent,
  status: sample.status,
  totalMs: sample.totalMs,
  width: sample.width,
});

export const listRuns = (): RunSummary[] =>
  [...store.runs.values()]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map(toRunSummary);

export const getRun = (runId: string): RunDetail | null => {
  const run = store.runs.get(runId);
  if (!run) {
    return null;
  }
  const samples = [...store.samples.values()]
    .filter((sample) => sample.runId === runId)
    .sort((left, right) => left.executionOrdinal - right.executionOrdinal);
  const judgments = samples
    .map((sample) => store.judgments.get(sample.id))
    .filter((judgment) => judgment !== undefined);
  const manualRatings = samples
    .map((sample) => store.manualRatings.get(sample.id))
    .filter((rating) => rating !== undefined);

  return {
    judgments,
    manualRatings,
    run: toRunSummary(run),
    samples: samples.map(toSampleRecord),
  };
};

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const cohortHashFor = (spec: RunSpecInput): string => {
  const parts = [
    spec.prompt,
    spec.aspect,
    spec.resolution,
    [...spec.models].sort().join(","),
    // Always a segment, even when null: omitting it for the default would let
    // a jpeg run and a default run hash identically, and a container format
    // that costs quality (jpeg) is not the same cohort as one that does not.
    spec.outputFormat ?? "",
    String(ALIGNMENT_SCHEMA_VERSION),
  ].join("|");
  return hashUnit(parts).toString(36).slice(2);
};

const finalizeRunIfDone = (runId: string): void => {
  const run = store.runs.get(runId);
  if (!run) {
    return;
  }
  const samples = [...store.samples.values()].filter(
    (sample) => sample.runId === runId
  );
  const settled = samples.filter((sample) => sample.status !== "pending");
  if (settled.length < samples.length) {
    return; // still generating
  }

  const succeeded = samples.filter((sample) => sample.status === "completed");
  run.status =
    succeeded.length === 0
      ? "failed"
      : succeeded.length === samples.length
        ? "completed"
        : "partial";
  run.completedAt = new Date();
  run.updatedAt = run.completedAt;
  run.costActualMicros = succeeded.reduce(
    (sum, sample) =>
      sum + (sample.costRefinedMicros ?? sample.costEstimatedMicros),
    0
  );

  if (run.judgeAfter && run.status !== "failed") {
    startJudging(runId, "mock-vision-judge-v1");
  }
};

const settleSample = (sampleId: string, runId: string): void => {
  const sample = store.samples.get(sampleId);
  const run = store.runs.get(runId);
  if (!sample || !run) {
    return;
  }

  const benchSpec = {
    aspect: run.aspect,
    outputFormat: run.outputFormat,
    prompt: run.prompt,
    resolution: run.resolution,
    seed: run.seed,
  } as const;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- modelAlias was validated against BENCH_ROUTES_BY_ALIAS in createRun; re-deriving the alignment here (rather than storing the closure) keeps StoredSample JSON-shaped
  const validatedAlias = sample.modelAlias as Parameters<typeof alignParams>[0];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- aspect/resolution/seed were validated at the API boundary (zod) before createRun stored them
  const validatedSpec = benchSpec as Parameters<typeof alignParams>[1];
  const alignment = alignParams(
    validatedAlias,
    validatedSpec,
    sample.sampleIndex
  );

  if (!alignment.ok) {
    sample.status = "failed";
    sample.errorCode = "HTTP_4XX";
    store.samples.set(sampleId, sample);
    run.updatedAt = new Date();
    finalizeRunIfDone(runId);
    return;
  }

  const attempt = buildSyntheticAttempt(
    runId,
    alignment,
    sample.costEstimatedMicros,
    sample.sampleIndex
  );

  sample.status = attempt.ok ? "completed" : "failed";
  sample.errorCode = attempt.errorCode;
  sample.providerMs = attempt.providerMs;
  sample.downloadMs = attempt.downloadMs;
  sample.width = attempt.width;
  sample.height = attempt.height;
  sample.bytes = attempt.bytes || null;
  sample.contentType = attempt.contentType || null;
  sample.costRefinedMicros = attempt.costRefinedMicros;
  sample.totalMs = attempt.totalMs;
  sample.droppedParams = attempt.droppedParams;
  sample.coercedParams = alignment.coerced;
  sample.queuePolled = attempt.queuePolled;

  store.samples.set(sampleId, sample);
  run.updatedAt = new Date();
  finalizeRunIfDone(runId);
};

export interface CreateRunResult {
  readonly runId: string;
}

interface PlannedMockSample {
  readonly id: string;
  /** Seeds `simulatedDelayMs`, so a given (run, model, sample) always takes
   * the same synthetic time however it was scheduled. */
  readonly key: string;
  readonly speedP95Seconds: number | null;
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

/** The mock counterpart of `db-store.ts`'s `dispatchRun`: same pool, same
 * limit, same fire-and-forget contract to the caller. The synthetic delay
 * moved inside the lane, so it now models generation *time* rather than a
 * scheduling offset — at `concurrency: 1` the delays run back to back
 * instead of overlapping.
 *
 * `startedAt` is stamped when the lane picks the sample up, which is what
 * makes the elapsed counter in the sheet measure this sample's own wait
 * rather than the whole run's. */
const dispatchMockSamples = (
  planned: readonly PlannedMockSample[],
  concurrency: number,
  runId: string
): void => {
  void runWithConcurrency(planned, {
    limit: concurrency,
    onError: (error, sample) => {
      console.error(
        `[bench mock-store] settleSample threw for sample ${sample.id}`,
        error
      );
    },
    worker: async (sample) => {
      const row = store.samples.get(sample.id);
      if (row) {
        row.startedAt = new Date();
        store.samples.set(sample.id, row);
      }
      await sleep(simulatedDelayMs(sample.key, sample.speedP95Seconds));
      settleSample(sample.id, runId);
    },
  });
};

/** Builds every (model, sample) row up front (status `pending`), then works
 * through them under the run's `concurrency` limit — the same `./pool.ts`
 * the Postgres store dispatches through.
 *
 * This store has no shared resource to contend over, so the limit changes
 * nothing about its synthetic results. It is honoured anyway because this is
 * the only store reachable without credentials, which makes it the only
 * place the dispatch behaviour can be *seen*: a sheet that fills one frame
 * at a time at `concurrency: 1` is what a real serial sweep looks like, and
 * a mock that fanned out regardless would show a shape the product no longer
 * has. */
export const createRun = (spec: RunSpecInput): CreateRunResult => {
  assertRunWithinCostCap(spec);

  const runId = randomUUID();
  const now = new Date();
  let executionOrdinal = 0;
  let costEstimatedTotal = 0;
  const planned: PlannedMockSample[] = [];

  for (const alias of spec.models) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- assertRunWithinCostCap (via routeFor) already rejected any alias without a route before this loop runs
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
      costEstimatedTotal += costEstimatedMicros;
      store.samples.set(sampleId, {
        bytes: null,
        coercedParams: [],
        contentType: null,
        costBasis: route.costBasis,
        costEstimatedMicros,
        costRefinedMicros: null,
        createdAt: now,
        downloadMs: null,
        droppedParams: [],
        endpoint: route.endpoint,
        errorCode: null,
        executionOrdinal: ordinal,
        height: null,
        id: sampleId,
        modelAlias: alias,
        modelName: route.modelName,
        providerMs: null,
        queuePolled: false,
        runId,
        sampleIndex,
        seedReturned: null,
        seedSent: spec.seed === null ? null : spec.seed + sampleIndex,
        // Null until this sample is actually picked up: with a concurrency
        // limit the last frame of a serial run waits minutes for its turn,
        // and a stopwatch started at run creation would show that wait as
        // generation time.
        startedAt: null,
        status: "pending",
        totalMs: null,
        width: null,
      });

      planned.push({
        id: sampleId,
        key: `${runId}:${alias}:${sampleIndex}`,
        speedP95Seconds: route.speedP95Seconds,
      });
    }
  }

  store.runs.set(runId, {
    aspect: spec.aspect,
    cohortHash: cohortHashFor(spec),
    completedAt: null,
    concurrency: spec.concurrency,
    costActualMicros: null,
    costEstimatedMicros: costEstimatedTotal,
    createdAt: now,
    id: runId,
    isMock: true,
    judgeAfter: spec.judgeAfter,
    judgingStatus: "not-started",
    maxEstimatedCostUsd: spec.maxEstimatedCostUsd,
    models: spec.models,
    outputFormat: spec.outputFormat,
    prompt: spec.prompt,
    resolution: spec.resolution,
    samplesPerModel: spec.samplesPerModel,
    seed: spec.seed,
    startedAt: now,
    status: "running",
    updatedAt: now,
  });

  // After the run row exists, never before — `settleSample` looks the run up
  // and a lane that started first would find nothing there.
  dispatchMockSamples(planned, spec.concurrency, runId);

  return { runId };
};

/** Judges every completed sample of a run that does not already carry a
 * judgment. Staggered with the same synthetic-delay shape as generation so
 * the run page's per-card "Judging…" state (`BRIEF.md`, the UI section) has
 * something real to poll toward instead of resolving instantly. */
export const startJudging = (runId: string, judgeModel: string): void => {
  const run = store.runs.get(runId);
  if (!run) {
    return;
  }
  const samples = [...store.samples.values()].filter(
    (sample) => sample.runId === runId && sample.status === "completed"
  );
  const toJudge = samples.filter((sample) => !store.judgments.has(sample.id));

  if (toJudge.length === 0) {
    run.judgingStatus =
      run.judgingStatus === "not-started" ? "done" : run.judgingStatus;
    return;
  }

  run.judgingStatus = "running";
  run.updatedAt = new Date();

  // Each sample's judgment lands on its own timer (no shared mutable state
  // across the closures — a completion count would need one, which is
  // exactly the loop-closure-over-a-`let` pattern that reads correctly but
  // outside every automated check's ability to prove). Completion is
  // instead detected by a single timer sized to the slowest sample plus a
  // buffer, which then checks the store directly.
  let maxDelayMs = 0;
  for (const sample of toJudge) {
    const delayMs = 250 + hashUnit(`${sample.id}:judge-delay`) * 1800;
    maxDelayMs = Math.max(maxDelayMs, delayMs);
    setTimeout(() => {
      judgeOneSample(runId, sample.id, sample.modelAlias, judgeModel);
    }, delayMs);
  }

  setTimeout(() => {
    markJudgingDoneIfSettled(runId);
  }, maxDelayMs + 50);
};

const judgeOneSample = (
  runId: string,
  sampleId: string,
  modelAlias: string,
  judgeModel: string
): void => {
  const verdict = buildSyntheticJudgment(sampleId, modelAlias);
  store.judgments.set(sampleId, {
    // The mock store is absolute-only: `mockRunEngine.comparativeJudge` is
    // `null` (no image on disk to compare), so a mock judgment never carries
    // rank standings or pair coverage.
    comparisons: 0,
    critique: verdict.critique,
    errorCode: verdict.errorCode,
    judgeModel,
    levels: verdict.levels,
    losses: 0,
    overall: verdict.overall,
    overallLevel: verdict.overallLevel,
    rank: null,
    rankedCount: null,
    rubricId: "bench-room-v1",
    rubricVersion: 1,
    sampleId,
    status: verdict.status,
    ties: 0,
    wins: 0,
  });
  markJudgingDoneIfSettled(runId);
};

const markJudgingDoneIfSettled = (runId: string): void => {
  const run = store.runs.get(runId);
  if (!run || run.judgingStatus !== "running") {
    return;
  }
  const completedSamples = [...store.samples.values()].filter(
    (sample) => sample.runId === runId && sample.status === "completed"
  );
  const allJudged = completedSamples.every((sample) =>
    store.judgments.has(sample.id)
  );
  if (allJudged) {
    run.judgingStatus = "done";
    run.updatedAt = new Date();
  }
};

/** Mock-side twin of `db-store.ts`'s `retrySamples`, same contract and the
 * same pure `planRetry` deciding it — so the refusal a caller sees for a
 * still-running run, a mismatched engine or an exhausted cost cap is
 * identical whichever store is live.
 *
 * The run goes back to `running` here too. This store's `finalizeRunIfDone`
 * has no `WHERE status = 'running'` guard to satisfy (it is single-threaded
 * `Map` mutation), but leaving the run `partial` while its samples
 * re-settled would still show a stale terminal status in the rail, and
 * divergence between the two stores' observable behaviour is precisely what
 * `repository.ts` exists to prevent. */
export const retrySamples = (
  runId: string,
  only?: readonly string[]
): RetryResult | null => {
  const run = store.runs.get(runId);
  if (!run) {
    return null;
  }

  const samples = [...store.samples.values()].filter(
    (sample) => sample.runId === runId
  );
  const plan = planRetry({
    costActualMicros: run.costActualMicros,
    // This store is only ever selected alongside the mock engine
    // (`repository.ts` derives both from the same credentials check), so the
    // mismatch refusal is unreachable here — passing the literal keeps the
    // planner's contract satisfied without pretending otherwise.
    engineIsMock: true,
    maxEstimatedCostUsd: run.maxEstimatedCostUsd,
    only,
    runIsMock: run.isMock,
    runStatus: run.status,
    samples,
  });
  if (plan.refusal !== null) {
    return { refusal: plan.refusal, retried: 0 };
  }

  const now = new Date();
  const planned: PlannedMockSample[] = [];
  for (const sampleId of plan.sampleIds) {
    const sample = store.samples.get(sampleId);
    if (!sample) {
      continue;
    }
    // Same reset as the Postgres patch: every field the settle path writes
    // goes back to its pre-attempt state so a stale failure cannot read as
    // fresh telemetry under a `pending` row.
    sample.bytes = null;
    sample.coercedParams = [];
    sample.contentType = null;
    sample.costRefinedMicros = null;
    sample.downloadMs = null;
    sample.droppedParams = [];
    sample.errorCode = null;
    sample.height = null;
    sample.providerMs = null;
    sample.queuePolled = false;
    sample.seedReturned = null;
    // Cleared, not restamped: the lane stamps it when it picks this sample
    // up, so a queued retry does not count time it spent waiting its turn.
    sample.startedAt = null;
    sample.status = "pending";
    sample.totalMs = null;
    sample.width = null;
    store.samples.set(sampleId, sample);

    planned.push({
      id: sampleId,
      key: `${runId}:${sample.modelAlias}:${sample.sampleIndex}`,
      speedP95Seconds: routeFor(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- modelAlias was validated against BENCH_ROUTES_BY_ALIAS in createRun before this sample row was ever written
        sample.modelAlias as Parameters<typeof routeFor>[0]
      ).speedP95Seconds,
    });
  }

  run.completedAt = null;
  run.status = "running";
  run.updatedAt = now;
  store.runs.set(runId, run);

  dispatchMockSamples(planned, run.concurrency, runId);

  return { refusal: null, retried: plan.sampleIds.length };
};

export const setManualRating = (input: {
  note?: string | null;
  sampleId: string;
  stars: number;
}): ManualRatingRecord => {
  const record: ManualRatingRecord = {
    note: input.note ?? null,
    sampleId: input.sampleId,
    stars: input.stars,
    updatedAt: new Date().toISOString(),
  };
  store.manualRatings.set(input.sampleId, record);
  return record;
};

export const sampleBelongsToRun = (sampleId: string): string | null =>
  store.samples.get(sampleId)?.runId ?? null;
