/**
 * The fire-and-forget half of starting a run: hand every planned sample to a
 * settle function under the run's `concurrency` limit, and return at once —
 * the caller is an HTTP handler that must answer with a run id, not wait out
 * a ten-minute sweep.
 *
 * The settle function is injected rather than imported, so this module
 * depends on nothing in `db-store.ts` and both that file and its retry split
 * can call it without an import cycle.
 *
 * Used by `createRun` and by the retry path, and it matters most to the
 * second: the samples being retried are overwhelmingly the ones fal rate
 * limited, so re-dispatching all of them at once recreates exactly the
 * condition that failed them.
 *
 * Nothing here calls `waitUntil`. On Vercel the instance can be frozen the
 * moment the response is sent, which is why a real sweep is a
 * long-lived-process job — see `docs/arc/handoff.md`.
 */
import { runWithConcurrency } from "./pool";

/** One detached task for the whole dispatch, not one per sample: the pool's
 * own `onError` is what keeps a failed sample from stranding the ones queued
 * behind it, so there is nothing left for a per-sample wrapper to catch. */
export const dispatchSamples = (
  sampleIds: readonly string[],
  concurrency: number,
  settle: (sampleId: string) => Promise<void>,
  label: string
): void => {
  void (async () => {
    await runWithConcurrency(sampleIds, {
      limit: concurrency,
      onError: (error, sampleId) => {
        console.error(
          `[bench ${label}] settle threw for sample ${sampleId} — the samples behind it continue`,
          error
        );
      },
      worker: async (sampleId) => {
        await settle(sampleId);
      },
    });
  })();
};
