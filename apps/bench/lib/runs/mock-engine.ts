/**
 * The composition root's mock generation + judging engine.
 *
 * `docs/arc/bench/BRIEF.md`, "Reality check": there is no database and no
 * fal access provisioned for this app. `@motif/bench-core`'s pure domain
 * functions (`alignParams`, `routeFor`, `assertWithinCostCap`,
 * `aggregateByModel`) are real and used as-is; everything a real
 * `GenerationExecutor`/`JudgeModelClient` would normally measure (provider
 * latency, returned pixel dimensions, judge verdicts) is synthesized here,
 * deterministically, from a hash of the run/model/sample identity — same
 * run, same model, same sample index always produces the same synthetic
 * numbers, so a re-render or a second poll never shows the sample
 * "changing its mind".
 *
 * This is the mock-mode half of the composition root's injection seam
 * (`BRIEF.md` rule 6: "Mock mode injected at the composition root, never an
 * env check inside `lib/`"). `mock-repository.ts` is the other half — it
 * owns the in-memory store this module writes into. A real executor
 * (`@motif/bench-core/execute`'s `executeGeneration` against a real
 * `FalClient`, and a real vision-model `JudgeModelClient`) is a later
 * phase's job once a database and `FAL_KEY` are actually provisioned; this
 * module's functions are exactly the seam that swap would replace.
 */
import { createHash } from "node:crypto";

import {
  alignParams,
  assertWithinCostCap,
  MissingPricingError,
  routeFor,
} from "@motif/bench-core";
import type { AlignmentResult, BenchSpec } from "@motif/bench-core";
import {
  qualityLevelForScore,
  ROOM_RUBRIC_ID,
  ROOM_RUBRIC_VERSION,
  ROOM_RUBRIC_WEIGHTS,
  weightedGeometricMeanWithSlopGate,
} from "@motif/bench-core/judge";
import type { QualityLevel, RoomJudgeLevels } from "@motif/bench-core/judge";

import type {
  EngineAttempt,
  EngineAttemptInput,
  EngineJudgment,
  EngineJudgmentInput,
  RunEngine,
} from "./engine";
import type {
  JudgeErrorCodeValue,
  PreviewModelRow,
  PreviewResult,
  RunSpecInput,
  SampleErrorCode,
} from "./types";
import { JUDGE_ERROR_CODES, SAMPLE_ERROR_CODES } from "./types";

/** A stable [0, 1) float derived from a string identity — the only source of
 * "randomness" in this module. Never `Math.random()`: two requests for the
 * same sample must agree. */
export const hashUnit = (identity: string): number => {
  const digest = createHash("sha256").update(identity).digest();
  // First 6 bytes give ~48 bits — comfortably more precision than a UI needs
  // and well clear of `Number.MAX_SAFE_INTEGER` (53 bits).
  let value = 0;
  for (let index = 0; index < 6; index++) {
    value = value * 256 + (digest[index] ?? 0);
  }
  return value / 256 ** 6;
};

/** `values` is always one of this module's own fixed, non-empty constant
 * arrays (`SAMPLE_ERROR_CODES`, `JUDGE_ERROR_CODES`, `LEVEL_POOL`), so the
 * throw below is an invariant guard, never a real runtime path — it exists
 * so this stays a safe index read instead of an `as T` cast. */
const pick = <T>(identity: string, values: readonly T[]): T => {
  const index = Math.min(
    values.length - 1,
    Math.floor(hashUnit(identity) * values.length)
  );
  const value = values[index];
  if (value === undefined) {
    throw new Error("pick() called with an empty values array");
  }
  return value;
};

// ---------------------------------------------------------------------------
// Preview (dry run) — pure, zero fal calls, per-model failure isolation.
// ---------------------------------------------------------------------------

const benchSpecFrom = (spec: RunSpecInput): BenchSpec => ({
  aspect: spec.aspect,
  outputFormat: null,
  prompt: spec.prompt,
  resolution: spec.resolution,
  seed: spec.seed,
});

/** One model's alignment can throw (an unmapped alias, a missing pricing
 * entry) without taking the rest of the preview down with it — the team
 * lead's brief: "one bad alignment cannot kill the whole preview". */
const previewOneModel = (
  alias: string,
  benchSpec: BenchSpec
): PreviewModelRow => {
  let alignment: AlignmentResult;
  try {
    // `alignParams` types `alias` as `GenerationModelName`; an unrecognized
    // string is exactly what its own `MODELS[alias]` lookup guards against
    // and reports as a normal alignment failure, so a runtime cast here is
    // the intended way to hand it unvalidated client input.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- alignParams validates the alias internally (MODELS[alias] lookup) and returns an AlignmentFailed row rather than throwing for an unknown one
    const candidateAlias = alias as Parameters<typeof alignParams>[0];
    alignment = alignParams(candidateAlias, benchSpec, 0);
  } catch (error) {
    return {
      alias,
      coerced: [],
      dropped: [],
      endpoint: null,
      errorMessage: error instanceof Error ? error.message : "alignment failed",
      modelName: alias,
      ok: false,
      speedP95Seconds: null,
      usesQueue: false,
      worstCaseCostUsd: 0,
    };
  }

  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same alias-narrowing rationale as alignParams above; routeFor throws MissingPricingError for anything not in BENCH_ROUTES_BY_ALIAS
    const route = routeFor(alias as Parameters<typeof routeFor>[0]);
    return {
      alias,
      coerced: alignment.ok ? alignment.coerced : [],
      dropped: alignment.ok ? alignment.dropped : [],
      endpoint: alignment.ok ? alignment.endpoint : null,
      errorMessage: alignment.ok ? null : alignment.message,
      modelName: route.modelName,
      ok: alignment.ok,
      speedP95Seconds: route.speedP95Seconds,
      usesQueue: route.usesQueue,
      worstCaseCostUsd: route.pricing.estimatedCostUsd,
    };
  } catch (error) {
    return {
      alias,
      coerced: [],
      dropped: [],
      endpoint: null,
      errorMessage:
        error instanceof MissingPricingError
          ? error.message
          : "no pricing route for this model",
      modelName: alias,
      ok: false,
      speedP95Seconds: null,
      usesQueue: false,
      worstCaseCostUsd: 0,
    };
  }
};

export const buildPreview = (spec: RunSpecInput): PreviewResult => {
  const benchSpec = benchSpecFrom(spec);
  const models = spec.models.map((alias) => previewOneModel(alias, benchSpec));
  const totalWorstCaseCostUsd = models.reduce(
    (sum, model) => sum + model.worstCaseCostUsd * spec.samplesPerModel,
    0
  );

  return {
    aspect: spec.aspect,
    aspectIsUniform: spec.aspect === "1:1",
    failedCount: models.filter((model) => !model.ok).length,
    models,
    totalWorstCaseCostUsd,
  };
};

/** Re-validates the cost cap server-side before a run is created — the
 * client's preview total must never be trusted as the enforcement point
 * (`BRIEF.md` rule 5: the cap "throws BEFORE any provider work", and a
 * client can always be stale or tampered with). Throws
 * `CostCapExceededError` (re-exported by `@motif/bench-core`) or
 * `MissingPricingError` — callers map both to a 400. */
export const assertRunWithinCostCap = (spec: RunSpecInput): number => {
  const aliases = spec.models.map(
    (alias) =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- routeFor (called inside assertWithinCostCap) throws MissingPricingError for anything not a real GenerationModelName, so this narrows the same way previewOneModel does
      alias as Parameters<typeof routeFor>[0]
  );
  return assertWithinCostCap(
    { models: aliases, samplesPerModel: spec.samplesPerModel },
    spec.maxEstimatedCostUsd
  );
};

export { CostCapExceededError, MissingPricingError } from "@motif/bench-core";

// ---------------------------------------------------------------------------
// Synthetic generation — deterministic per (runId, alias, sampleIndex).
// ---------------------------------------------------------------------------

/** Pixel dimensions a real fal response would report for this alignment —
 * presentation-only mock data, but derived from the same `sizeMode` +
 * requested aspect the real SDK dialects would actually resolve to
 * (`docs/arc/bench/BRIEF.md`'s aspect table), not an arbitrary constant. */
const DIMENSIONS_BY_ASPECT: Record<string, { height: number; width: number }> =
  {
    "1:1": { height: 1024, width: 1024 },
    "16:9": { height: 576, width: 1024 },
    "2:3": { height: 1536, width: 1024 },
    "3:2": { height: 1024, width: 1536 },
    "3:4": { height: 1024, width: 768 },
    "4:3": { height: 768, width: 1024 },
    "9:16": { height: 1024, width: 576 },
  };

export interface SyntheticAttempt {
  readonly bytes: number;
  readonly coercedParams: string[];
  readonly contentType: string;
  readonly costRefinedMicros: number | null;
  readonly downloadMs: number | null;
  readonly droppedParams: string[];
  readonly errorCode: SampleErrorCode | null;
  readonly height: number | null;
  readonly ok: boolean;
  readonly providerMs: number | null;
  readonly queuePolled: boolean;
  readonly seedReturned: number | null;
  readonly totalMs: number;
  readonly width: number | null;
}

/** Deterministic simulated wall-clock delay before a sample "arrives" —
 * compressed to a UI-friendly range regardless of the model's real p95
 * (which would be tens of seconds and make manually exercising the polling
 * UI painful). A `speedP95Seconds`-derived floor still widens slower models'
 * range relative to faster ones, so the ordering a viewer sees is at least
 * directionally honest. */
export const simulatedDelayMs = (
  identity: string,
  speedP95Seconds: number | null
): number => {
  const floorMs = 300;
  const spreadMs =
    speedP95Seconds === null ? 2200 : Math.min(2200, speedP95Seconds * 40);
  return Math.round(floorMs + hashUnit(`${identity}:delay`) * spreadMs);
};

export const buildSyntheticAttempt = (
  runId: string,
  alignment: Extract<AlignmentResult, { ok: true }>,
  costEstimatedMicros: number,
  sampleIndex: number
): SyntheticAttempt => {
  const identity = `${runId}:${alignment.alias}:${sampleIndex}`;
  const failed = hashUnit(`${identity}:outcome`) < 1 / 9;

  if (failed) {
    const errorCode = pick(`${identity}:error`, SAMPLE_ERROR_CODES);
    return {
      bytes: 0,
      coercedParams: [],
      contentType: "",
      costRefinedMicros: null,
      downloadMs: null,
      droppedParams: [],
      errorCode,
      height: null,
      ok: false,
      providerMs: null,
      queuePolled: alignment.usesQueue,
      seedReturned: null,
      totalMs: Math.round(200 + hashUnit(`${identity}:failMs`) * 800),
      width: null,
    };
  }

  const aspect = alignment.options.aspect ?? "1:1";
  const dims = DIMENSIONS_BY_ASPECT[aspect] ?? DIMENSIONS_BY_ASPECT["1:1"];
  let providerMs = Math.round(400 + hashUnit(`${identity}:provider`) * 6000);
  // gpt2's queue polls every 3000ms — `providerMs` carries that granularity
  // for real; round to the nearest 3s so the mock reproduces the same
  // "queue ±3s" badge condition the UI has to handle either way.
  if (alignment.usesQueue) {
    providerMs = Math.max(3000, Math.round(providerMs / 3000) * 3000);
  }
  const downloadMs = Math.round(30 + hashUnit(`${identity}:download`) * 400);
  const costDrift = 0.85 + hashUnit(`${identity}:cost`) * 0.3;

  return {
    bytes: Math.round(400_000 + hashUnit(`${identity}:bytes`) * 2_000_000),
    coercedParams: alignment.coerced.map((entry) => entry.param),
    contentType: "image/png",
    costRefinedMicros: Math.round(costEstimatedMicros * costDrift),
    downloadMs,
    droppedParams: alignment.dropped.map((entry) => entry.param),
    errorCode: null,
    height: dims?.height ?? null,
    ok: true,
    providerMs,
    queuePolled: alignment.usesQueue,
    seedReturned: alignment.seedSent,
    totalMs: providerMs + downloadMs,
    width: dims?.width ?? null,
  };
};

// ---------------------------------------------------------------------------
// Synthetic judging — same rubric maths as `@motif/bench-core/judge`, a
// deterministic verdict instead of a real vision-model call.
// ---------------------------------------------------------------------------

export interface SyntheticJudgment {
  readonly critique: string | null;
  readonly errorCode: JudgeErrorCodeValue | null;
  readonly levels: RoomJudgeLevels | null;
  readonly overall: number | null;
  readonly overallLevel: QualityLevel | null;
  readonly status: "inconclusive" | "scored";
}

const LEVEL_POOL: readonly QualityLevel[] = [
  "slop",
  "stock",
  "stock",
  "competent",
  "competent",
  "competent",
  "editorial",
];

/** A per-model quality bias (not per-sample) so repeat samples of the same
 * model cluster sensibly and different models genuinely separate on the
 * verdict strip / scatter — a per-sample-only random level would make every
 * model look equally noisy, which defeats the point of a quality
 * comparison. */
const modelQualityBias = (alias: string): number =>
  hashUnit(`quality:${alias}`);

/** Deterministic level for one rubric criterion — a safe index read into
 * `LEVEL_POOL` (invariant-guarded the same way `pick` is above), never an
 * `as QualityLevel` cast. */
const levelForRoll = (roll: number): QualityLevel => {
  const index = Math.min(
    LEVEL_POOL.length - 1,
    Math.floor(roll * LEVEL_POOL.length)
  );
  const level = LEVEL_POOL[index];
  if (level === undefined) {
    throw new Error("levelForRoll() index out of range");
  }
  return level;
};

export const buildSyntheticJudgment = (
  sampleIdentity: string,
  alias: string
): SyntheticJudgment => {
  const inconclusive = hashUnit(`${sampleIdentity}:judge-outcome`) < 1 / 12;
  if (inconclusive) {
    return {
      critique: null,
      errorCode: pick(`${sampleIdentity}:judge-error`, JUDGE_ERROR_CODES),
      levels: null,
      overall: null,
      overallLevel: null,
      status: "inconclusive",
    };
  }

  const bias = modelQualityBias(alias);
  const rollFor = (criterion: string) =>
    (hashUnit(`${sampleIdentity}:${criterion}`) + bias) / 2;
  // Explicit per-criterion fields, not a `ROOM_RUBRIC_CRITERIA.map(...)` +
  // `Object.fromEntries` + cast — this stays exhaustively checked against
  // `RoomJudgeLevels` by the object literal itself, with no runtime cast.
  const levels: RoomJudgeLevels = {
    artifacts: levelForRoll(rollFor("artifacts")),
    lightingCoherence: levelForRoll(rollFor("lightingCoherence")),
    materialFidelity: levelForRoll(rollFor("materialFidelity")),
    photorealism: levelForRoll(rollFor("photorealism")),
    promptAdherence: levelForRoll(rollFor("promptAdherence")),
    spatialPlausibility: levelForRoll(rollFor("spatialPlausibility")),
  };

  const overall = weightedGeometricMeanWithSlopGate(
    levels,
    ROOM_RUBRIC_WEIGHTS
  );

  return {
    critique: `Mock judge (${ROOM_RUBRIC_ID} v${ROOM_RUBRIC_VERSION}): synthesized verdict for local development — no vision model was called.`,
    errorCode: null,
    levels,
    overall,
    overallLevel: qualityLevelForScore(overall),
    status: "scored",
  };
};

export { usdToMicros as usdMicros } from "@motif/bench-core";

// ---------------------------------------------------------------------------
// RunEngine — the mock half of the `./engine.ts` composition-root seam.
// ---------------------------------------------------------------------------

/** Wraps this module's existing synchronous synthetic builders behind the
 * shared `RunEngine` shape (`./engine.ts`) — `isMock: true` is stated once,
 * here, and every store persists it verbatim rather than re-deciding it. */
export const mockRunEngine: RunEngine = {
  // oxlint-disable-next-line require-await -- RunEngine.buildAttempt must return a Promise; buildSyntheticAttempt itself is synchronous by design (no fetch, no timers)
  buildAttempt: async (input: EngineAttemptInput): Promise<EngineAttempt> => {
    const attempt = buildSyntheticAttempt(
      input.runId,
      input.alignment,
      input.costEstimatedMicros,
      input.sampleIndex
    );
    return {
      bytes: attempt.bytes,
      contentType: attempt.contentType,
      costRefinedMicros: attempt.costRefinedMicros,
      downloadMs: attempt.downloadMs,
      droppedParams: attempt.droppedParams,
      errorCode: attempt.errorCode,
      falRequestId: null,
      height: attempt.height,
      imagePath: null,
      ok: attempt.ok,
      providerMs: attempt.providerMs,
      queuePolled: attempt.queuePolled,
      seedReturned: attempt.seedReturned,
      totalMs: attempt.totalMs,
      width: attempt.width,
    };
  },
  // oxlint-disable-next-line require-await -- RunEngine.buildJudgment must return a Promise; buildSyntheticJudgment itself is synchronous by design (no network, no timers)
  buildJudgment: async (
    input: EngineJudgmentInput
  ): Promise<EngineJudgment> => {
    const verdict = buildSyntheticJudgment(input.sampleId, input.alias);
    return {
      costMicros: null,
      critique: verdict.critique,
      errorCode: verdict.errorCode,
      levels: verdict.levels,
      overall: verdict.overall,
      overallLevel: verdict.overallLevel,
      status: verdict.status,
    };
  },
  // A mock sample writes no image to disk (`buildAttempt` above returns
  // `imagePath: null`), so there is nothing to upload and nothing for a
  // vision model to compare. Comparative judging is genuinely unavailable
  // here, not merely switched off — stated as `null` rather than faked, the
  // same discipline as `isMock` itself.
  comparativeJudge: null,
  isMock: true,
  judgeModelLabel: "mock-vision-judge-v1",
};
