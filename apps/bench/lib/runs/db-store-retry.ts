/**
 * The Postgres store's partial re-run path — split out of `db-store.ts` for
 * the same reason `db-store-judging.ts` was (oxlint's `max-lines`); this is
 * still part of the same store, not a separate concern.
 *
 * Why it exists: a 24-model sweep that loses three samples to provider rate
 * limiting is not a run worth paying for twice. Only the failures get
 * re-dispatched, and they go back through `db-store.ts`'s own `settleSample`
 * rather than a parallel generation path — there is exactly one place in
 * this app that turns an aligned request into a persisted sample.
 *
 * What decides *whether* to spend lives in `./retry.ts`'s pure `planRetry`;
 * everything here is the thin wrapper that applies the plan, mirroring the
 * `planReconciliation` / `reconcileRunIfPastDeadline` split.
 *
 * `repository.ts` imports `retrySamples` from here directly rather than
 * through a `db-store.ts` re-export (the shape `startJudging` uses): this
 * module imports *from* `db-store.ts`, so re-exporting back through it would
 * close an import cycle for no gain.
 */
import { routeFor } from "@motif/bench-core";
import { benchRuns, benchSamples } from "@motif/bench-db";
import type { BenchDb } from "@motif/bench-db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { RunSpecJsonSchema } from "./db-json";
import {
  reconcileRunIfPastDeadline,
  runDetached,
  settleSample,
} from "./db-store";
import { computeRunDeadlineMs } from "./deadline";
import { dispatchSamples } from "./dispatch";
import type { RunEngine } from "./engine";
import { planRetry } from "./retry";
import type { RetryResult } from "./retry";
import { RUN_STATUSES, SAMPLE_STATUSES } from "./types";

const RunStatusSchema = z.enum(RUN_STATUSES);
const SampleStatusSchema = z.enum(SAMPLE_STATUSES);

/** Same lazy boundary `db-store.ts` uses and for the same reason: a static
 * import of `@motif/bench-db/client` would parse `process.env` at module
 * evaluation and break the zero-env `next build` gate. */
const getDb = async (): Promise<BenchDb> => {
  // oxlint-disable-next-line howells/no-runtime-dynamic-imports -- deliberate lazy boundary, see above and db-store.ts's header
  const { db } = await import("@motif/bench-db/client");
  return db();
};

/** Every column `settleSample` writes, returned to its pre-attempt state, so
 * a retry that itself dies cannot leave the old failure's telemetry sitting
 * under a `pending` row and read as fresh. `requestBody` is `NOT NULL` and
 * is rewritten unconditionally by the next settle, so it stays put rather
 * than being nulled into a constraint violation. `costEstimatedMicros`,
 * `seedSent`, `endpoint` and `executionOrdinal` are properties of the *plan*,
 * not of the attempt, and must survive — the retry re-runs the same planned
 * sample, it does not re-plan it. */
export const buildRetryResetPatch = () => ({
  bytes: null,
  coercedParams: null,
  contentType: null,
  costRefinedMicros: null,
  downloadMs: null,
  droppedParams: null,
  errorCode: null,
  falRequestId: null,
  height: null,
  imagePath: null,
  providerMs: null,
  queuePolled: false,
  seedReturned: null,
  // Cleared, not left pointing at the failed attempt's dispatch. Without
  // this the retried sample re-enters the sheet already counting from the
  // original run — a frame showing eight hours elapsed the instant you press
  // Retry. `settleSample` sets it again when the retry is actually
  // dispatched.
  startedAt: null,
  status: "pending" as const,
  totalMs: null,
  width: null,
});

/** A model alias that has since left the SDK's route table would throw out
 * of `routeFor`. That is not a reason to refuse the whole retry — the
 * sample's own `alignParams` call inside `settleSample` will fail it as
 * `HTTP_4XX` a moment later, which is the right answer — so the unknown
 * alias only costs us its published p95, and the deadline falls back to the
 * same floor the 12 models with no published p95 already use. */
const speedP95For = (modelAlias: string): number | null => {
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- routeFor throws MissingPricingError for anything not a real GenerationModelName, which is exactly what the catch is for
    return routeFor(modelAlias as Parameters<typeof routeFor>[0])
      .speedP95Seconds;
  } catch {
    return null;
  }
};

/** Re-dispatches a finished run's failed samples.
 *
 * The run must go back to `running`, and this is the subtle part.
 * `finalizeRunIfDone`'s write is guarded `WHERE status = 'running'` — that
 * guard is what makes finalisation single-writer — so a run left `partial`
 * would take the retry, settle it, and then match zero rows: the sample
 * would flip to `completed` while the run stayed `partial` with a stale
 * `costActualMicros` forever. `completedAt` is cleared for the same reason
 * (the run has not completed) and `spec.deadlineAt` is pushed out, because
 * the original deadline is long past and `reconcileRunIfPastDeadline` would
 * otherwise `TIMEOUT` the retry on the very next read, before fal answered.
 *
 * Returns `null` when the run does not exist, so the route can 404 rather
 * than reporting a refusal for a run that was never there. */
export const retrySamples = async (
  runId: string,
  engine: RunEngine,
  only?: readonly string[]
): Promise<RetryResult | null> => {
  const db = await getDb();
  const [run] = await db
    .select()
    .from(benchRuns)
    .where(eq(benchRuns.id, runId))
    .limit(1);
  if (!run) {
    return null;
  }

  const sampleRows = await db
    .select({
      costEstimatedMicros: benchSamples.costEstimatedMicros,
      id: benchSamples.id,
      modelAlias: benchSamples.modelAlias,
      sampleIndex: benchSamples.sampleIndex,
      status: benchSamples.status,
    })
    .from(benchSamples)
    .where(eq(benchSamples.runId, runId));

  const spec = RunSpecJsonSchema.parse(run.spec);
  const plan = planRetry({
    costActualMicros: run.costActualMicros,
    engineIsMock: engine.isMock,
    maxEstimatedCostUsd: spec.maxEstimatedCostUsd,
    only,
    runIsMock: run.isMock,
    runStatus: RunStatusSchema.parse(run.status),
    samples: sampleRows.map((row) => ({
      costEstimatedMicros: row.costEstimatedMicros,
      id: row.id,
      status: SampleStatusSchema.parse(row.status),
    })),
  });
  if (plan.refusal !== null) {
    return { refusal: plan.refusal, retried: 0 };
  }

  const retryIds = new Set(plan.sampleIds);
  const retryRows = sampleRows.filter((row) => retryIds.has(row.id));
  // Budgeted over the retried samples only — a three-sample retry does not
  // deserve a twenty-four-sample deadline.
  const deadlineMs = computeRunDeadlineMs(
    retryRows.map((row) => ({ speedP95Seconds: speedP95For(row.modelAlias) }))
  );
  const now = new Date();
  const deadlineAtIso = new Date(now.getTime() + deadlineMs).toISOString();

  await db.batch([
    db
      .update(benchSamples)
      .set({ ...buildRetryResetPatch(), updatedAt: now })
      .where(
        and(
          eq(benchSamples.runId, runId),
          inArray(benchSamples.id, plan.sampleIds)
        )
      ),
    db
      .update(benchRuns)
      .set({
        completedAt: null,
        spec: { ...spec, deadlineAt: deadlineAtIso },
        status: "running",
        updatedAt: now,
      })
      .where(eq(benchRuns.id, runId)),
  ]);

  // Under the run's own concurrency limit, through the same dispatcher
  // `createRun` uses. This is the case that most needs it: the samples being
  // retried are overwhelmingly the ones fal rate-limited, and firing all of
  // them at once again is precisely the condition that failed them.
  dispatchSamples(
    retryRows.map((row) => row.id),
    run.concurrency,
    async (sampleId) => {
      await settleSample(sampleId, runId, engine);
    },
    "db-store-retry"
  );

  // Same two-layer guard `createRun` uses: a timer that dies with the
  // process, plus `getRun`'s reconcile-on-read that survives a restart.
  setTimeout(() => {
    runDetached("reconcileRunIfPastDeadline", async () => {
      await reconcileRunIfPastDeadline(runId);
    });
  }, deadlineMs);

  return { refusal: null, retried: plan.sampleIds.length };
};
