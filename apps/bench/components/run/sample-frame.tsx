"use client";

import { RotateCcwIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDimensions, formatSeconds, formatUsd } from "@/lib/format";
import { modelNameOf } from "@/lib/model-names";
import { useRetrySamples } from "@/lib/queries";
import type {
  ManualRatingRecord,
  RunSummary,
  SampleErrorCode,
  SampleRecord,
} from "@/lib/runs/types";

import { JudgePanel } from "./judge-panel";
import { LiveElapsed } from "./live-elapsed";

/** What went wrong, in the words a person would use. The vocabulary is closed:
 * provider text never reaches the store, so it never reaches the screen. */
const ERROR_COPY: Record<SampleErrorCode, string> = {
  DOWNLOAD_FAILED: "Download failed",
  HTTP_4XX: "Request rejected",
  HTTP_5XX: "Provider error",
  INTERRUPTED: "Interrupted",
  NO_IMAGE: "No image returned",
  RATE_LIMITED: "Rate limited",
  SAFETY: "Blocked by the safety filter",
  TIMEOUT: "Provider timeout",
};

const PARAM_LABEL: Record<string, string> = {
  aspect: "Aspect",
  outputFormat: "Format",
  resolution: "Resolution",
  seed: "Seed",
};

const labelOf = (param: string): string =>
  PARAM_LABEL[param] ?? `${param.slice(0, 1).toUpperCase()}${param.slice(1)}`;

/** What the run did to reach this Model, in one line: what it ignored, what it
 * changed, and otherwise the resolution it asked for. */
const paramNote = (sample: SampleRecord, run: RunSummary): string => {
  const parts = [
    ...sample.droppedParams.map((param) => `${labelOf(param)} ignored`),
    ...sample.coercedParams.map(
      (entry) => `${labelOf(entry.param)} ${entry.to}`
    ),
  ];
  if (
    !sample.droppedParams.includes("resolution") &&
    !sample.coercedParams.some((entry) => entry.param === "resolution")
  ) {
    parts.unshift(`Resolution ${run.resolution}`);
  }
  return parts.join(" · ");
};

/** The right-hand figure on the first line: a stopwatch while the image is in
 * the air and the measured provider time once it lands, with the one mark that
 * says the time is only good to about three seconds. */
const LatencyCell = ({ sample }: { readonly sample: SampleRecord }) => (
  <span className="text-muted type-small flex shrink-0 items-baseline gap-2 tabular-nums">
    {sample.queuePolled && sample.elapsedMs === null ? (
      <Tooltip>
        <TooltipTrigger className="cursor-help">±3 s</TooltipTrigger>
        <TooltipContent>
          Queued by the provider, so good to about 3 s
        </TooltipContent>
      </Tooltip>
    ) : null}
    {sample.elapsedMs === null ? (
      sample.status === "completed" ? (
        formatSeconds(sample.providerMs)
      ) : null
    ) : (
      <LiveElapsed elapsedMs={sample.elapsedMs} />
    )}
  </span>
);

/** A failed image says why and offers its own retry, because a failure is
 * usually spotted while looking at the frame it belongs to. */
const FailedTile = ({
  errorCode,
  retryable,
  runId,
  sampleId,
}: {
  readonly errorCode: SampleErrorCode | null;
  readonly retryable: boolean;
  readonly runId: string;
  readonly sampleId: string;
}) => {
  const retry = useRetrySamples(runId);
  return (
    <div className="bg-surface flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
      <p className="type-body">Generation failed</p>
      <p className="text-muted type-small">
        {errorCode === null ? "Unknown reason" : ERROR_COPY[errorCode]}
      </p>
      {retryable ? (
        <button
          className="app-button"
          disabled={retry.isPending}
          onClick={() => {
            retry.mutate([sampleId]);
          }}
          type="button"
        >
          <RotateCcwIcon aria-hidden="true" size={18} strokeWidth={1.5} />
          {retry.isPending ? "Retrying" : "Retry"}
        </button>
      ) : null}
      {retry.error === null ? null : (
        <p className="text-bad type-small">{retry.error.message}</p>
      )}
    </div>
  );
};

interface SampleFrameProps {
  readonly manualRating: ManualRatingRecord | undefined;
  readonly onInspect: (sampleId: string) => void;
  /** False while the run is still generating: a retry on a running run would
   * pay for an image that is already in the air, so the control is withheld. */
  readonly retryable: boolean;
  readonly run: RunSummary;
  readonly sample: SampleRecord;
}

/** One image and its caption: the Model, the time, the cost, what the run did
 * to reach it, and the rating. The frame is square and cropped to fill, so a
 * row of mixed aspects stays a row. Opening it shows the whole image. */
export const SampleFrame = ({
  manualRating,
  onInspect,
  retryable,
  run,
  sample,
}: SampleFrameProps) => {
  const name = modelNameOf(sample.modelAlias, sample.modelName);
  const settled = sample.status === "completed" || sample.status === "failed";
  const failed = sample.status === "failed";
  const completed = sample.status === "completed";
  // A stored image can go missing (rows from before images moved to Blob
  // point at a disk that is gone); the frame says so rather than showing
  // a broken image.
  const [missing, setMissing] = useState(false);

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      <div className="bg-surface relative aspect-square w-full">
        {completed && sample.imageUrl !== null && missing ? (
          <div className="text-muted type-small flex size-full items-center justify-center">
            Image unavailable
          </div>
        ) : null}
        {completed && sample.imageUrl !== null && !missing ? (
          <button
            aria-label={`Open ${name}, sample ${sample.sampleIndex}`}
            className="absolute inset-0 block size-full cursor-zoom-in"
            onClick={() => {
              onInspect(sample.id);
            }}
            type="button"
          >
            <Image
              alt={`${name}, sample ${sample.sampleIndex}`}
              className="object-cover"
              fill
              onError={() => {
                setMissing(true);
              }}
              sizes="(width < 48rem) 50vw, 33vw"
              src={sample.imageUrl}
              unoptimized
            />
          </button>
        ) : null}
        {failed ? (
          <FailedTile
            errorCode={sample.errorCode}
            retryable={retryable}
            runId={run.id}
            sampleId={sample.id}
          />
        ) : null}
        {settled ? null : (
          <div className="type-body flex size-full items-center justify-center">
            Generating
          </div>
        )}
      </div>

      <figcaption className="flex flex-col gap-2">
        <div className="type-small flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{name}</span>
          {failed ? (
            <span className="text-muted shrink-0">Failed</span>
          ) : (
            <LatencyCell sample={sample} />
          )}
        </div>
        <div className="text-muted type-small flex justify-between gap-2 tabular-nums">
          <span>
            {failed
              ? "Cost unavailable"
              : settled
                ? formatUsd(
                    sample.costRefinedMicros ?? sample.costEstimatedMicros
                  )
                : "Waiting"}
          </span>
          {settled && !failed ? (
            <span>{formatDimensions(sample.width, sample.height)}</span>
          ) : null}
        </div>
        <p className="text-muted type-small">{paramNote(sample, run)}</p>
        {completed ? (
          <>
            <div className="max-md:hidden">
              <JudgePanel
                manualRating={manualRating}
                runId={run.id}
                sampleId={sample.id}
              />
            </div>
            <div className="flex md:hidden">
              <button
                className="app-button type-body flex-1 justify-between"
                onClick={() => {
                  onInspect(sample.id);
                }}
                type="button"
              >
                <span className="tabular-nums">
                  {manualRating === undefined
                    ? "Not rated"
                    : `${manualRating.stars} ★`}
                </span>
                <span className="text-muted type-small">Rate</span>
              </button>
            </div>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
};
