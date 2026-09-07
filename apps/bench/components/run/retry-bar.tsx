"use client";

import { Button } from "@/components/ui/button";
import { useRetrySamples } from "@/lib/queries";
import type { RunSummary, SampleRecord } from "@/lib/runs/types";

/** The whole reason this exists: a 24-model sweep that loses three samples
 * to provider rate limiting should not have to be re-run — and re-paid for —
 * from scratch. One line above the sheet, counting the failures and
 * offering to re-dispatch exactly those.
 *
 * It scrolls with the sheet rather than pinning. The shell spec fixes the
 * regions that are always true of a run (verdicts, tabs) and this is not one
 * of them: it is an annotation on the failed frames, it disappears the
 * moment they succeed, and pinning it would spend a fourth fixed band on a
 * transient state. The per-frame `Retry` in `sample-error.tsx` is what
 * covers the case of spotting a failure halfway down the sheet.
 *
 * Renders nothing at all when the run has no failures, which is the ordinary
 * case — an empty bar reserving height above every healthy sheet would be a
 * permanent tax paid for an occasional event.
 *
 * Nothing here is accent-filled. The shell spec allows two accent elements
 * on screen (Run, best-in-row marks); a recovery control for a partial run
 * is not competing for one of them. */
export const RetryBar = ({
  run,
  samples,
}: {
  readonly run: RunSummary;
  readonly samples: readonly SampleRecord[];
}) => {
  const retry = useRetrySamples(run.id);
  const failed = samples.filter((sample) => sample.status === "failed");

  // A `running` run is refused by `planRetry` (a pending sample is in the air
  // and re-dispatching it pays for the same image twice), so the bar stays
  // out of the way until the run settles — including while a retry it
  // started is itself in flight, which is why it vanishes on click rather
  // than sitting there disabled.
  if (failed.length === 0 || run.status === "running") {
    return null;
  }

  return (
    <div className="border-plate-edge mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-4">
      <p className="text-plate-muted text-[13px]">
        <span className="text-plate-ink">
          {failed.length} of {samples.length}
        </span>{" "}
        {failed.length === 1 ? "sample" : "samples"} failed. Retrying
        re-dispatches only those — the {samples.length - failed.length} that
        succeeded are kept, and not paid for again.
      </p>
      <Button
        className="ml-auto"
        disabled={retry.isPending}
        onClick={() => {
          // `null`, not the failed ids: the server re-derives what is
          // retryable from the run's current state, so a sheet rendered from
          // a slightly stale poll cannot ask it to re-run a sample that has
          // since succeeded.
          retry.mutate(null);
        }}
        size="sm"
        variant="plate"
      >
        {retry.isPending ? "Retrying…" : `Retry ${failed.length} failed`}
      </Button>
      {retry.error === null ? null : (
        <p className="text-bad w-full text-[12px]">{retry.error.message}</p>
      )}
    </div>
  );
};
