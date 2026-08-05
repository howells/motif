import { getLiveCredentials } from "@motif/bench-env/runtime";

/**
 * The app's persistence seam. Every route handler under `app/api/**` reads
 * and writes through this module, never through `mock-store.ts` or
 * `db-store.ts` directly — so this is the ONLY place that decides which
 * implementation is live. Mode is derived from credentials at the
 * composition root — see the comment above `getLiveCredentials()` below.
 * (Historical note: a BENCH_MOCK env flag used to select only the store
 * while generation always ran mock, so a "live" run persisted synthetic
 * data as real. Deriving both store and engine from one credentials check
 * makes that disagreement impossible.)
 * one is actually named for. `selectEngine()` is called fresh at each call
 * site, never hoisted to module scope — `createLiveEngine()` reads `FAL_KEY`
 * and throws if it is missing, which must never happen at module-eval time
 * (that would break the zero-env `next build` gate) or on a dev-server boot
 * where nothing has requested a live run yet.
 *
 * Both store modules export the same surface (`createRun`, `getRun`,
 * `listRuns`, `startJudging`, `retrySamples`, `setManualRating`,
 * `sampleBelongsToRun`) — `mock-store.ts`'s functions are synchronous,
 * `db-store.ts`'s are async.
 * Every export below returns a `Promise` regardless of which implementation
 * is selected, so route handlers always `await` and never need to know
 * which one is live. `useMockStore` is checked inline at each call site
 * (rather than pre-selecting a single function reference) — deliberately:
 * a stored union of a sync and an async function forwarded uniform types to
 * `tsc` but not to oxlint's simpler union-call inference, so branching per
 * call keeps every function's return type unambiguous.
 */
import {
  createRun as dbCreateRun,
  getRun as dbGetRun,
  getSampleImage as dbGetSampleImage,
  listRuns as dbListRuns,
  sampleBelongsToRun as dbSampleBelongsToRun,
  setManualRating as dbSetManualRating,
  startJudging as dbStartJudging,
} from "./db-store";
// Imported straight from the split-out module rather than re-exported through
// `db-store.ts` (the shape `startJudging` uses): `db-store-retry.ts` imports
// *from* `db-store.ts`, so routing it back would close an import cycle.
import { retrySamples as dbRetrySamples } from "./db-store-retry";
import type { RunEngine } from "./engine";
import { createLiveEngine } from "./live-engine";
import { buildPreview, mockRunEngine } from "./mock-engine";
import {
  createRun as mockCreateRun,
  getRun as mockGetRun,
  listRuns as mockListRuns,
  retrySamples as mockRetrySamples,
  sampleBelongsToRun as mockSampleBelongsToRun,
  setManualRating as mockSetManualRating,
  startJudging as mockStartJudging,
} from "./mock-store";
import type { RetryResult } from "./retry";
import type {
  ManualRatingRecord,
  PreviewResult,
  RunDetail,
  RunSpecInput,
  RunSummary,
} from "./types";

export { CostCapExceededError, MissingPricingError } from "./mock-engine";

/** Store selection — unchanged from before this phase. Pure and exported so
 * the BENCH_MOCK → store/engine mapping is unit-testable without touching
 * `process.env` or a live database. */
// Mode is DERIVED from credentials, never configured (user decision,
// 2026-08-05: the environment carries only tokens and keys). All live
// credentials present -> live store and engine; anything missing -> mock
// for both. There is no flag to set and therefore none to misconfigure —
// the old BENCH_MOCK produced exactly that bug, a "live" run of synthetic
// data persisted as real. `getLiveCredentials` parses at call time and
// never throws, so a zero-env build and a credential-less dev boot both
// resolve to mock without touching this module's import graph.
const liveCredentials = getLiveCredentials();
const useMockStore = liveCredentials === null;
const useMockEngine = liveCredentials === null;

const selectEngine = (): RunEngine =>
  useMockEngine ? mockRunEngine : createLiveEngine();

/** Dry-run preview: pure alignment + worst-case cost, zero fal calls, zero
 * persistence. Exposed from the repository module for a single import
 * surface even though it never touches either store. */
export const previewRun = (spec: RunSpecInput): PreviewResult =>
  buildPreview(spec);

/** Throws `CostCapExceededError` / `MissingPricingError` — route handlers
 * map both to a 400 with the closed reason, never a raw 500. The cost-cap
 * assertion happens inside the selected store's `createRun` itself, before
 * any sample row is written (`BRIEF.md` rule 5: the cap must throw before
 * any provider work, and here "provider work" is standing up the run at
 * all). */
export const createRun = async (
  spec: RunSpecInput
): Promise<{ runId: string }> =>
  useMockStore ? mockCreateRun(spec) : await dbCreateRun(spec, selectEngine());

export const listRuns = async (): Promise<RunSummary[]> =>
  useMockStore ? mockListRuns() : await dbListRuns();

/** The Postgres branch passes `selectEngine()` (same pattern as `createRun`/
 * `startJudging`) — `db-store.ts`'s `getRun` needs an engine to finalise a
 * run its own deadline-reconciliation pass just timed out (`./db-store.ts`'s
 * header on `getRun`). The mock store never times out a run this way (no
 * `deadlineAt` concept there — `mock-engine.ts`'s synthetic delays are
 * already bounded), so it stays a plain passthrough. */
export const getRun = async (runId: string): Promise<RunDetail | null> =>
  useMockStore ? mockGetRun(runId) : await dbGetRun(runId, selectEngine());

/** Backs the live image route (`app/api/image/[runId]/[alias]
 * /[sampleIndex]/route.ts`) — `mock-store.ts` never has a real file on disk
 * to serve (its samples are always synthesized on request by
 * `app/api/mock-image/**`), so the mock branch is always `null` rather than
 * a call into `mock-store.ts` for a capability it doesn't have. */
export const getSampleImage = async (
  runId: string,
  modelAlias: string,
  sampleIndex: number
): Promise<{ contentType: string | null; imagePath: string } | null> =>
  useMockStore ? null : await dbGetSampleImage(runId, modelAlias, sampleIndex);

export const startJudging = async (
  runId: string,
  judgeModel: string,
  force = false
): Promise<boolean> => {
  const existing = await getRun(runId);
  if (!existing) {
    return false;
  }
  if (useMockStore) {
    mockStartJudging(runId, judgeModel);
  } else {
    await dbStartJudging(runId, judgeModel, selectEngine(), force);
  }
  return true;
};

/** Re-runs the failed part of a finished run — the recovery path for
 * transient provider failures, `RATE_LIMITED` above all. `null` means the
 * run does not exist (the route 404s); a non-null `refusal` means the retry
 * was declined for a reason from `retry.ts`'s closed set and nothing was
 * written or dispatched.
 *
 * The Postgres branch passes `selectEngine()`, same as `createRun` — and
 * `planRetry` compares its `isMock` against the run's own persisted flag, so
 * adding credentials to a machine that already has mock runs on it cannot
 * quietly start writing real images into a run the whole app believes is
 * synthetic. */
export const retrySamples = async (
  runId: string,
  only?: readonly string[]
): Promise<RetryResult | null> =>
  useMockStore
    ? mockRetrySamples(runId, only)
    : await dbRetrySamples(runId, selectEngine(), only);

export const setManualRating = async (input: {
  note?: string | null;
  sampleId: string;
  stars: number;
}): Promise<ManualRatingRecord | null> => {
  const belongsToRun = useMockStore
    ? mockSampleBelongsToRun(input.sampleId)
    : await dbSampleBelongsToRun(input.sampleId);
  if (belongsToRun === null) {
    return null;
  }
  return useMockStore
    ? mockSetManualRating(input)
    : await dbSetManualRating(input);
};
