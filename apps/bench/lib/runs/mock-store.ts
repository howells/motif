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
  models: readonly string[];
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
    outputFormat: null,
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

/** Builds every (model, sample) row up front (status `pending`), then
 * schedules each one's synthetic completion independently — mirrors
 * `benchmark-run`'s `planRun → .foreach(runOneModel)` shape closely enough
 * that a real executor swap would not change this function's structure,
 * even though the concurrency knob itself is not simulated (there is no
 * shared resource in-process to contend over; it is stored and badged, not
 * enforced — see `mock-engine.ts`'s header). */
export const createRun = (spec: RunSpecInput): CreateRunResult => {
  assertRunWithinCostCap(spec);

  const runId = randomUUID();
  const now = new Date();
  let executionOrdinal = 0;
  let costEstimatedTotal = 0;

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
        status: "pending",
        totalMs: null,
        width: null,
      });

      const delayMs = simulatedDelayMs(
        `${runId}:${alias}:${sampleIndex}`,
        route.speedP95Seconds
      );
      setTimeout(() => {
        settleSample(sampleId, runId);
      }, delayMs);
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
    models: spec.models,
    prompt: spec.prompt,
    resolution: spec.resolution,
    samplesPerModel: spec.samplesPerModel,
    seed: spec.seed,
    startedAt: now,
    status: "running",
    updatedAt: now,
  });

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
