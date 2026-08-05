/**
 * The app's persistence seam. Every route handler under `app/api/**` reads
 * and writes through this module, never through `mock-store.ts` or
 * `db-store.ts` directly — so this is the ONLY place that decides which
 * implementation is live. `BENCH_MOCK=1` selects `mock-store.ts` (the
 * original in-process `Map`, unchanged); anything else selects
 * `db-store.ts` (real Postgres, `docs/arc/bench/BRIEF.md`'s "Reality check"
 * no longer applies once a database is provisioned). Never an env check
 * inside `lib/` helpers or components — one decision, one place, so a fake
 * run can never reach a real longitudinal stat regardless of which path a
 * given request took.
 *
 * Store and *engine* (`./engine.ts`) are selected independently here, even
 * though both currently derive from the same `BENCH_MOCK` value — this is
 * the fix for the bug this phase exists to close (`./engine.ts`'s header):
 * `BENCH_MOCK` used to select only the store, while generation always ran
 * through `mock-engine.ts` regardless, so a `BENCH_MOCK=0` run landed in
 * Postgres carrying synthetic data labeled `isMock: false`. `useMockStore`
 * and `useMockEngine` are two separate consts, computed separately, so nothing
 * short of BENCH_MOCK itself changing can make them disagree with what each
 * one is actually named for. `selectEngine()` is called fresh at each call
 * site, never hoisted to module scope — `createLiveEngine()` reads `FAL_KEY`
 * and throws if it is missing, which must never happen at module-eval time
 * (that would break the zero-env `next build` gate) or on a dev-server boot
 * where nothing has requested a live run yet.
 *
 * Both store modules export the same surface (`createRun`, `getRun`,
 * `listRuns`, `startJudging`, `setManualRating`, `sampleBelongsToRun`) —
 * `mock-store.ts`'s functions are synchronous, `db-store.ts`'s are async.
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
import type { RunEngine } from "./engine";
import { createLiveEngine } from "./live-engine";
import { buildPreview, mockRunEngine } from "./mock-engine";
import {
  createRun as mockCreateRun,
  getRun as mockGetRun,
  listRuns as mockListRuns,
  sampleBelongsToRun as mockSampleBelongsToRun,
  setManualRating as mockSetManualRating,
  startJudging as mockStartJudging,
} from "./mock-store";
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
export const storeModeFromEnv = (
  rawBenchMock: string | undefined
): "mock" | "postgres" => (rawBenchMock === "1" ? "mock" : "postgres");

/** Engine selection — independent of store selection. Mock unless
 * `BENCH_MOCK` is explicitly `"0"`: an unset or malformed value must default
 * to mock (`BRIEF.md` rule 6), never accidentally select live.
 * `storeModeFromEnv(x) === "mock"` implies `engineModeFromEnv(x) === "mock"`
 * for every possible `x` (`"1" !== "0"`), so "mock store + live engine"
 * never arises; "Postgres store + mock engine" (`rawBenchMock` unset or some
 * other value) does, deliberately — a safe way to seed Postgres with
 * synthetic data, now correctly flagged `isMock: true` instead of this
 * phase's bug. */
export const engineModeFromEnv = (
  rawBenchMock: string | undefined
): "live" | "mock" => (rawBenchMock === "0" ? "live" : "mock");

// oxlint-disable-next-line no-restricted-properties -- this module IS the composition-root env-check boundary (BRIEF.md: one decision, one place); BENCH_MOCK is optional so a raw read never throws
const rawBenchMock = process.env.BENCH_MOCK;

const useMockStore = storeModeFromEnv(rawBenchMock) === "mock";
const useMockEngine = engineModeFromEnv(rawBenchMock) === "mock";

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
  judgeModel: string
): Promise<boolean> => {
  const existing = await getRun(runId);
  if (!existing) {
    return false;
  }
  if (useMockStore) {
    mockStartJudging(runId, judgeModel);
  } else {
    await dbStartJudging(runId, judgeModel, selectEngine());
  }
  return true;
};

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
