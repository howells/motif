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
