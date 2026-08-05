/**
 * Injection seam between the workflow graph and everything that actually
 * talks to fal or a database.
 *
 * `BRIEF.md` rule 4 (the purity split) puts every `fetch`, file write, and
 * fal call in `bench-core`; this package must contain none of them. It also
 * says (non-negotiable, this phase): "Mock executor only this phase. No
 * test, no default path, no dev-server boot may hit fal or a real database.
 * There is no provisioned DB — do not run migrations or connect."
 *
 * So `generate.ts` and `persist.ts` depend only on the two interfaces below,
 * and `createBenchmarkRunWorkflow` (`./workflows/benchmark-run.ts`) takes
 * them as constructor arguments rather than importing an implementation.
 * `mockGenerationExecutor` / `mockPersistExecutor` are the only
 * implementations this package ships — they are what `src/index.ts` wires
 * into the registered `benchmark-run` workflow, and what every test in this
 * package runs against. A later phase (bench-db exists, a `FalClient` is
 * available) wires real implementations at the app's composition root by
 * calling `createBenchmarkRunWorkflow` with a `GenerationExecutor` backed by
 * `executeGeneration` (`@motif/bench-core/execute`) and a `PersistExecutor`
 * backed by `@motif/bench-db` — neither of which this package imports.
 */
import { randomUUID } from "node:crypto";

import type { AlignmentOk } from "@motif/bench-core";
import type { ExecuteResult } from "@motif/bench-core/execute";
import type { JudgmentResult } from "@motif/bench-core/judge";

/** What `generate.ts` hands the executor: the resolved alignment (so a real
 * implementation has the exact fal request to send) and a destination for
 * the downloaded bytes. `imagePath` is opaque to the mock — only a real,
 * filesystem-backed executor gives it meaning. */
export interface GenerationAttemptInput {
  readonly alignment: AlignmentOk;
  readonly imagePath: string;
  readonly signal: AbortSignal;
}

export interface GenerationExecutor {
  readonly execute: (input: GenerationAttemptInput) => Promise<ExecuteResult>;
}

/** What `persist.ts` hands the executor — everything a `bench_samples` row
 * needs (`bench-db/src/schema.ts`) plus the raw `ExecuteResult`, without this
 * package importing `@motif/bench-db`'s Drizzle schema. */
export interface PersistSampleInput {
  readonly alias: string;
  readonly costBasis: string;
  readonly costEstimatedMicros: number;
  readonly executionOrdinal: number;
  readonly modelName: string;
  readonly result: ExecuteResult;
  readonly runId: string;
  readonly sampleIndex: number;
  readonly usesQueue: boolean;
}

export interface PersistedSample {
  readonly sampleId: string;
}

export interface PersistExecutor {
  readonly persist: (input: PersistSampleInput) => Promise<PersistedSample>;
}

/**
 * Deterministic, network-free, filesystem-free stand-in for a real
 * `executeGeneration` call. Every field is synthesized rather than measured —
 * this is what makes it safe as the default in `src/index.ts` and in every
 * test in this package (`BRIEF.md`: "no default path ... may hit fal").
 *
 * Always reports `ok: true`; tests that need to exercise `generate`'s failure
 * path inject a purpose-built `GenerationExecutor` instead (see
 * `benchmark-run-workflow.test.ts`) rather than adding failure knobs here.
 */
export const mockGenerationExecutor: GenerationExecutor = {
  // oxlint-disable-next-line require-await -- GenerationExecutor.execute must return a Promise; this mock's body is synchronous by design (no fetch, no timers)
  execute: async (input: GenerationAttemptInput): Promise<ExecuteResult> => ({
    bytes: 12_345,
    contentType: "image/png",
    downloadMs: 5,
    falRequestId: `mock-${randomUUID()}`,
    height: 1024,
    imagePath: input.imagePath,
    ok: true,
    providerMs: 50,
    seedReturned: input.alignment.seedSent,
    totalMs: 55,
    width: 1024,
  }),
};

/**
 * Stand-in for a `@motif/bench-db`-backed persister. Returns a fresh id and
 * keeps nothing — there is no provisioned database this phase, so nothing
 * would be there to read back anyway.
 */
export const mockPersistExecutor: PersistExecutor = {
  // oxlint-disable-next-line require-await -- PersistExecutor.persist must return a Promise; this mock's body is synchronous by design (no database)
  persist: async (input: PersistSampleInput): Promise<PersistedSample> => ({
    sampleId: `mock-${input.runId}-${input.alias}-${input.sampleIndex}`,
  }),
};

// ---------------------------------------------------------------------------
// judge-run executors
//
// Same purity seam as above, split into the same three concerns
// `judge-run.ts`'s three named steps map onto: `loadSamples` (a DB read),
// `judgeOne` (the vision-model call — `@motif/bench-core/judge`'s
// `judgeSample`, injected the same way `execute.ts`'s `executeGeneration` is,
// never called from this package directly), and `finalizeJudging` (a batched
// DB write of every judgment). This package ships only mocks — a later
// phase's composition root wires a real `SampleLoaderExecutor` against
// `@motif/bench-db`'s `bench_samples`, a real `JudgeExecutor` wrapping
// `judgeSample` with a real `LanguageModel`, and a real
// `JudgmentPersistExecutor` against `bench_judgments`.
// ---------------------------------------------------------------------------

/** What `loadSamples` needs per sample — deliberately narrow (no `alias`, no
 * model name): the loader reads a run's samples from the database, but only
 * the three fields a blind judge call needs ever leave this executor. */
export interface SampleToJudgeRaw {
  readonly imagePath: string;
  readonly prompt: string;
  readonly sampleId: string;
}

export interface SampleLoaderExecutor {
  readonly loadSamples: (runId: string) => Promise<SampleToJudgeRaw[]>;
}

export interface JudgeAttemptInput {
  readonly imagePath: string;
  readonly prompt: string;
}

/** Structurally identical to `@motif/bench-core/judge`'s own
 * `(client, input) => Promise<JudgmentResult>` shape, minus the client
 * argument — `judgeOne`'s injected executor is the fully-composed call (a
 * real implementation closes over its own `JudgeModelClient`), the same way
 * `GenerationExecutor.execute` is the fully-composed generation call rather
 * than taking a `GenerationClient` itself. */
export interface JudgeExecutor {
  readonly judge: (input: JudgeAttemptInput) => Promise<JudgmentResult>;
}

/** What `finalizeJudging` hands the persist executor per outcome — mirrors
 * `bench_judgments` (`bench-db/src/schema.ts`) closely enough for a real
 * implementation to map straight onto a row, without this package importing
 * `@motif/bench-db`'s Drizzle schema (same rationale as `PersistSampleInput`
 * above). `levels`/`overall`/`critique` are `null` for an inconclusive
 * outcome — `status` is the source of truth, not their presence. */
export interface PersistJudgmentInput {
  readonly critique: string | null;
  readonly errorCode: string | null;
  readonly judgeModel: string;
  readonly levels: Record<string, unknown> | null;
  readonly overall: number | null;
  readonly rubricId: string;
  readonly rubricVersion: number;
  readonly sampleId: string;
  readonly status: "inconclusive" | "scored";
}

export interface PersistedJudgment {
  readonly judgmentId: string;
}

export interface JudgmentPersistExecutor {
  readonly persistJudgment: (
    input: PersistJudgmentInput
  ) => Promise<PersistedJudgment>;
}

/** Deterministic, network-free, filesystem-free stand-in for a real
 * `bench_samples`-backed loader. Returns one synthesized sample per run —
 * enough for `judge-run-workflow.test.ts` to exercise the whole pipeline
 * without a database. */
export const mockSampleLoaderExecutor: SampleLoaderExecutor = {
  // oxlint-disable-next-line require-await -- SampleLoaderExecutor.loadSamples must return a Promise; this mock's body is synchronous by design (no database)
  loadSamples: async (runId: string): Promise<SampleToJudgeRaw[]> => [
    {
      imagePath: `mock/${runId}/0.png`,
      prompt: "A well-lit modern living room with a gray sofa.",
      sampleId: `mock-${runId}-sample-0`,
    },
  ],
};

/** Deterministic, network-free stand-in for a real vision-model call. Always
 * reports a mid-scale `scored` verdict; tests that need the inconclusive
 * path inject a purpose-built `JudgeExecutor` instead (see
 * `judge-run-workflow.test.ts`) rather than adding failure knobs here — same
 * convention as `mockGenerationExecutor` above. */
export const mockJudgeExecutor: JudgeExecutor = {
  // oxlint-disable-next-line require-await -- JudgeExecutor.judge must return a Promise; this mock's body is synchronous by design (no vision model call)
  judge: async (): Promise<JudgmentResult> => ({
    // Mirrors `bench-core/judge.ts`'s ROOM_RUBRIC_ID/ROOM_RUBRIC_VERSION —
    // duplicated as literals rather than value-imported, so this package
    // never pulls a value (as opposed to a type) out of the judge module's
    // `node:fs/promises`-importing implementation.
    critique: "Mock judge: plausible composition, no obvious defects.",
    levels: {
      artifacts: "competent",
      lightingCoherence: "competent",
      materialFidelity: "competent",
      photorealism: "competent",
      promptAdherence: "competent",
      spatialPlausibility: "competent",
    },
    overall: 3,
    overallLevel: "competent",
    rubricId: "bench-room-v1",
    rubricVersion: 1,
    status: "scored",
  }),
};

/** Deterministic, network-free, filesystem-free stand-in for a real
 * `bench_judgments`-backed persister. Returns a fresh id and keeps nothing —
 * there is no provisioned database this phase, same as `mockPersistExecutor`. */
export const mockJudgmentPersistExecutor: JudgmentPersistExecutor = {
  // oxlint-disable-next-line require-await -- JudgmentPersistExecutor.persistJudgment must return a Promise; this mock's body is synchronous by design (no database)
  persistJudgment: async (
    input: PersistJudgmentInput
  ): Promise<PersistedJudgment> => ({
    judgmentId: `mock-judgment-${input.sampleId}`,
  }),
};
