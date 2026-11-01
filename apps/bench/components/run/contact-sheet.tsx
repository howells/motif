"use client";

import { RotateCcwIcon } from "lucide-react";

import { useRetrySamples } from "@/lib/queries";
import type {
  ManualRatingRecord,
  RunSummary,
  SampleRecord,
} from "@/lib/runs/types";
import { groupByModel } from "@/lib/sample-order";

import { SampleFrame } from "./sample-frame";

interface ContactSheetProps {
  readonly manualRatings: readonly ManualRatingRecord[];
  readonly onInspect: (sampleId: string) => void;
  readonly run: RunSummary;
  readonly samples: readonly SampleRecord[];
}

/** How many images failed, and one control to run exactly those again. The
 * server works out what is retryable from the run's current state, so a stale
 * poll cannot ask it to repeat an image that has since landed. It shows only
 * once the run has settled, because a retry on a running run is refused. */
const RetryBar = ({
  run,
  samples,
}: {
  readonly run: RunSummary;
  readonly samples: readonly SampleRecord[];
}) => {
  const retry = useRetrySamples(run.id);
  const failed = samples.filter((sample) => sample.status === "failed");
  if (failed.length === 0 || run.status === "running") {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-muted type-small tabular-nums">
        {failed.length} of {samples.length} failed
      </p>
      <button
        className="app-button"
        disabled={retry.isPending}
        onClick={() => {
          retry.mutate(null);
        }}
        type="button"
      >
        <RotateCcwIcon aria-hidden="true" size={18} strokeWidth={1.5} />
        {retry.isPending ? "Retrying" : `Retry ${failed.length} failed`}
      </button>
      {retry.error === null ? null : (
        <p className="text-bad type-small w-full">{retry.error.message}</p>
      )}
    </div>
  );
};

/** The run's images, grouped by Model: a column per Model on a wide screen,
 * with its samples stacked beneath, and a two-up sheet on a phone. Frames are
 * square and the grid's tracks are fixed by the width, so nothing moves when
 * an image lands. */
export const ContactSheet = ({
  manualRatings,
  onInspect,
  run,
  samples,
}: ContactSheetProps) => {
  const ratingBySample = new Map(
    manualRatings.map((entry) => [entry.sampleId, entry])
  );
  if (samples.length === 0) {
    return <p className="text-muted type-small p-4 md:p-6">No images yet</p>;
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-2 pb-6 md:px-6">
      <RetryBar run={run} samples={samples} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] md:gap-x-6">
        {groupByModel(samples).map(([alias, group]) => (
          <div
            className="contents md:flex md:min-w-0 md:flex-col md:gap-6"
            key={alias}
          >
            {group.map((sample) => (
              <SampleFrame
                key={sample.id}
                manualRating={ratingBySample.get(sample.id)}
                onInspect={onInspect}
                retryable={run.status !== "running"}
                run={run}
                sample={sample}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
