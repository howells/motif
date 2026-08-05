"use client";

import { Aperto } from "@patternmode/aperto";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDimensions, formatMs, formatUsd } from "@/lib/format";
import type { ManualRatingRecord, SampleRecord } from "@/lib/runs/types";
import { cn } from "@/lib/utils";

import { JudgePanel } from "./judge-panel";
import { SampleError } from "./sample-error";

/** What the run had to change to reach this model, on one line.
 *
 * `drops` and `coerces` used to occupy a line each, reserved on every frame
 * whether or not it had anything to say — so a model that coerced nothing
 * still carried two blank lines and the caption showed visible holes where
 * the reservation sat. One line, both halves, reserved once.
 *
 * Still a non-breaking space rather than a fixed height when reserved, so the
 * held line is exactly one line of this type at this size. */
const ParamLine = ({
  coerced,
  dropped,
  reserve,
}: {
  readonly coerced: readonly string[];
  readonly dropped: readonly string[];
  readonly reserve: boolean;
}) => {
  const parts = [
    dropped.length === 0 ? null : `drops ${dropped.join(", ")}`,
    coerced.length === 0 ? null : `coerces ${coerced.join(", ")}`,
  ].filter((part) => part !== null);

  if (parts.length === 0 && !reserve) {
    return null;
  }
  return (
    <span className="truncate text-[11px] text-plate-muted/70">
      {parts.length === 0 ? " " : parts.join(" · ")}
    </span>
  );
};

/** The tallest an annotation gets: alias with latency, cost with dimensions,
 * the params line, the judge verdict where a historical run carries one, and
 * the star row — plus the block's own padding. Held as a floor on every cell
 * so a model that dropped nothing does not sit shorter than its neighbour and
 * pull the lattice out of alignment.
 *
 * It was 176px: seven mono lines at one size and one weight under every
 * picture, taller than the 160px frame it captions on a phone and 42% of the
 * cell on a desktop, which read as a log dump rather than a caption. Pairing
 * alias with latency and cost with dimensions on shared baselines, and folding
 * drops and coerces into one line, carries the same information in four. */
const ANNOTATION_MIN_HEIGHT = "min-h-[104px]";

interface SampleFrameProps {
  readonly contended: boolean;
  readonly manualRating: ManualRatingRecord | undefined;
  /** Index into the parent `Aperto.Group`'s media array, or `undefined` for
   * a sample with no image (failed, pending). */
  readonly apertoIndex?: number;
  /** Set when *some* sample in the sheet coerced a param — this frame then
   * holds the line even if it coerced nothing, so the annotation blocks stay
   * the same height and the lattice stays aligned. */
  readonly reserveCoercesLine: boolean;
  readonly reserveDropsLine: boolean;
  readonly runId: string;
  readonly sample: SampleRecord;
}

/** One cell of the contact sheet: a square frame with zero radius, and its
 * annotation directly beneath in mono — not a card
 * (`docs/design/specs/design-bench.md`).
 *
 * The frame is square and `object-cover` regardless of the run's requested
 * aspect, because a contact sheet is *uniform* frames — ragged rows are
 * harder to scan than a cropped thumbnail is misleading, and the expanded
 * view one click away shows the untouched full-resolution image. Its size is
 * fixed by the grid track, so nothing reflows when an image lands.
 *
 * The contention and queue-granularity marks sit *beside the latency* rather
 * than floating over the image, because that is the number they qualify:
 * both mean "this figure is not comparable to the others in the column".
 *
 * Both the thumbnail and the expanded view render through one `renderImage`
 * with `unoptimized` set — see `aperto-media.tsx`. They previously disagreed
 * (optimized thumbnail, unoptimized full-res), which meant two different URLs
 * and a refetch on every expansion. */
export const SampleFrame = ({
  contended,
  manualRating,
  apertoIndex,
  reserveCoercesLine,
  reserveDropsLine,
  runId,
  sample,
}: SampleFrameProps) => (
  <figure className="m-0 flex min-w-0 flex-col bg-plate">
    <div className="relative aspect-square w-full bg-plate">
      {sample.status === "completed" &&
      sample.imageUrl !== null &&
      apertoIndex !== undefined ? (
        // Aperto owns the trigger and the shared-element transition into the
        // expanded view. The hover outline is the only thing telling you a
        // frame opens, so it stays: `accent-soft` rather than the accent
        // itself, so the outline reads as a hover state and not as one of the
        // two accent-filled elements the shell spec allows. Drawn inside the
        // frame so it never crosses the gutter.
        <Aperto.Thumbnail
          className="relative block size-full cursor-zoom-in outline-1 -outline-offset-1 outline-transparent transition-[outline-color] duration-150 hover:outline-accent-soft focus-visible:outline-plate-ink [&_img]:size-full"
          index={apertoIndex}
        />
      ) : null}

      {sample.status === "failed" ? (
        <SampleError errorCode={sample.errorCode} />
      ) : null}

      {sample.status === "pending" || sample.status === "running" ? (
        <Skeleton className="size-full rounded-frame" />
      ) : null}
    </div>

    {/* Two columns, not one: the alias and the cost read down the left of the
        sheet while latency and dimensions right-align into their own columns.
        Every track in a row is the same width, so right-aligning puts the
        latencies of a whole column of models on one edge — which is the
        comparison the sheet exists to make. */}
    <figcaption
      className={cn("flex flex-col gap-1 px-2.5 py-2.5", ANNOTATION_MIN_HEIGHT)}
    >
      <span className="flex items-baseline gap-2">
        {/* The alias is a name, not a measurement — you read it, you do not
            scan a column of them for an outlier. Body font. The two figures
            beneath and beside it keep mono, because those *are* scanned down
            the grid, and that contrast is what makes the mono mean
            something. */}
        <span className="truncate text-[12px] text-plate-ink">
          {sample.modelAlias}
        </span>

        {/* A failed attempt has no latency and no real cost — only an estimate
            that was never spent. Printing either (or an em dash standing in
            for them) would put numbers in a comparison column that cannot be
            compared, so the failed frame carries its alias and its reason and
            nothing else.

            Where there is a latency, the marks lead and the number trails, so
            every latency in a column lands on the same right edge whether or
            not its model carries a qualifier. */}
        {sample.status === "failed" ? null : (
          <span className="bench-numeric ml-auto flex shrink-0 items-baseline gap-1.5 text-[11px] text-plate-ink">
            {sample.queuePolled ? (
              <Tooltip>
                <TooltipTrigger className="cursor-help text-warn">
                  ±3s
                </TooltipTrigger>
                <TooltipContent>
                  This provider reports through a polled queue, so its latency
                  is only accurate to about three seconds. Do not compare it
                  directly with the others.
                </TooltipContent>
              </Tooltip>
            ) : null}
            {contended ? (
              <Tooltip>
                <TooltipTrigger className="cursor-help text-warn">
                  contended
                </TooltipTrigger>
                <TooltipContent>
                  This run generated more than one image at a time, so latencies
                  include queueing against each other and are not comparable
                  with a serial run.
                </TooltipContent>
              </Tooltip>
            ) : null}
            {formatMs(sample.providerMs)}
          </span>
        )}
      </span>

      {sample.status === "failed" ? null : (
        <span className="bench-numeric flex items-baseline gap-2 text-[11px] text-plate-muted">
          {formatUsd(sample.costRefinedMicros ?? sample.costEstimatedMicros)}
          <span className="ml-auto shrink-0 text-plate-muted/70">
            {formatDimensions(sample.width, sample.height)}
          </span>
        </span>
      )}

      {/* Reserving the line keeps the judge verdict and the star row on one
          baseline across the row. A failed frame has no latency, cost or
          verdict to align to, so it opts out rather than carrying a stray
          gap. */}
      <ParamLine
        coerced={sample.coercedParams.map((entry) => entry.param)}
        dropped={sample.droppedParams}
        reserve={
          (reserveDropsLine || reserveCoercesLine) && sample.status !== "failed"
        }
      />

      {sample.status === "completed" ? (
        <JudgePanel
          manualRating={manualRating}
          runId={runId}
          sampleId={sample.id}
        />
      ) : null}
    </figcaption>
  </figure>
);
