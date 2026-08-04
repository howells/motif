"use client";

import Image from "next/image";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDimensions, formatMs, formatUsd } from "@/lib/format";
import type {
  JudgmentRecord,
  ManualRatingRecord,
  SampleRecord,
} from "@/lib/runs/types";
import { cn } from "@/lib/utils";

import { JudgePanel } from "./judge-panel";
import { SampleError } from "./sample-error";

/** A dropped/coerced-param line, or the blank that holds its place. Rendered
 * as a non-breaking space rather than a fixed height so the reserved line is
 * exactly one line of this type at this size, whatever the type is doing. */
const ParamLine = ({
  label,
  params,
  reserve,
}: {
  readonly label: string;
  readonly params: readonly string[];
  readonly reserve: boolean;
}) => {
  if (params.length === 0 && !reserve) {
    return null;
  }
  return (
    <span className="truncate font-mono text-[11px] text-plate-muted">
      {params.length === 0 ? " " : `${label} ${params.join(", ")}`}
    </span>
  );
};

/** The tallest an annotation gets: alias, latency, cost · dimensions, drops,
 * coerces, judge verdict and the star row, plus the block's own padding. Held
 * as a floor on every cell so a model that dropped nothing does not sit
 * shorter than its neighbour and pull the lattice out of alignment. */
const ANNOTATION_MIN_HEIGHT = "min-h-[176px]";

interface SampleFrameProps {
  readonly contended: boolean;
  readonly judgment: JudgmentRecord | undefined;
  readonly manualRating: ManualRatingRecord | undefined;
  readonly onOpen: () => void;
  /** Set when *some* sample in the sheet coerced a param — this frame then
   * holds the line even if it coerced nothing, so the annotation blocks stay
   * the same height and the lattice stays aligned. */
  readonly reserveCoercesLine: boolean;
  readonly reserveDropsLine: boolean;
  readonly runId: string;
  readonly runJudgingInFlight: boolean;
  readonly sample: SampleRecord;
}

/** One cell of the contact sheet: a square frame with zero radius, and its
 * annotation directly beneath in mono — not a card
 * (`docs/design/specs/design-bench.md`).
 *
 * The frame is square and `object-cover` regardless of the run's requested
 * aspect, because a contact sheet is *uniform* frames — ragged rows are
 * harder to scan than a cropped thumbnail is misleading, and the lightbox
 * one click away shows the untouched full-resolution image. Its size is
 * fixed by the grid track, so nothing reflows when an image lands.
 *
 * The contention and queue-granularity marks sit *beside the latency* rather
 * than floating over the image, because that is the number they qualify:
 * both mean "this figure is not comparable to the others in the column".
 *
 * Thumbnails go through the Next image optimizer (`sizes` set for the grid);
 * only the lightbox's full-res view opts out — see `lightbox.tsx`. */
export const SampleFrame = ({
  contended,
  judgment,
  manualRating,
  onOpen,
  reserveCoercesLine,
  reserveDropsLine,
  runId,
  runJudgingInFlight,
  sample,
}: SampleFrameProps) => (
  <figure className="m-0 flex min-w-0 flex-col bg-plate">
    <div className="relative aspect-square w-full bg-plate">
      {sample.status === "completed" && sample.imageUrl !== null ? (
        <button
          // `relative`, not decoration: `next/image` with `fill` positions
          // against its *direct* parent, and a static button would silently
          // size the thumbnail against the page instead of the frame.
          //
          // The hover outline is the only thing telling you a frame opens;
          // without it the affordance is invisible. `accent-soft` rather than
          // the forest accent itself, which at 1.9:1 on the plate would not
          // read — and drawn inside the frame so it never overlaps a
          // neighbour across the 1px gutter.
          className="relative block size-full cursor-zoom-in border-0 bg-transparent p-0 outline-1 -outline-offset-1 outline-transparent transition-[outline-color] duration-150 hover:outline-accent-soft focus-visible:outline-plate-ink"
          onClick={onOpen}
          type="button"
        >
          <Image
            alt={`${sample.modelName ?? sample.modelAlias}, sample ${sample.sampleIndex}`}
            className="rounded-frame object-cover"
            fill
            sizes="240px"
            src={sample.imageUrl}
          />
        </button>
      ) : null}

      {sample.status === "failed" ? (
        <SampleError errorCode={sample.errorCode} />
      ) : null}

      {sample.status === "pending" || sample.status === "running" ? (
        <Skeleton className="size-full rounded-frame" />
      ) : null}
    </div>

    <figcaption
      className={cn("flex flex-col gap-1.5 px-3 py-3", ANNOTATION_MIN_HEIGHT)}
    >
      <span className="truncate font-mono text-[11px] text-plate-ink">
        {sample.modelAlias}
      </span>

      {/* A failed attempt has no latency and no real cost — only an estimate
          that was never spent. Printing either (or an em dash standing in for
          them) would put numbers in a comparison column that cannot be
          compared, so the failed frame carries its alias and its reason and
          nothing else. */}
      {sample.status === "failed" ? null : (
        <>
          <span className="bench-numeric flex flex-wrap items-center gap-x-2 text-[11px] text-plate-muted">
            {formatMs(sample.providerMs)}
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
          </span>

          <span className="bench-numeric text-[11px] text-plate-muted">
            {formatUsd(sample.costRefinedMicros ?? sample.costEstimatedMicros)}{" "}
            · {formatDimensions(sample.width, sample.height)}
          </span>
        </>
      )}

      {/* Reserving blank lines keeps the judge verdict on one baseline across
          the row. A failed frame has no latency, cost or verdict to align to,
          so it opts out rather than carrying a stray gap. */}
      <ParamLine
        label="drops"
        params={sample.droppedParams}
        reserve={reserveDropsLine && sample.status !== "failed"}
      />
      <ParamLine
        label="coerces"
        params={sample.coercedParams.map((entry) => entry.param)}
        reserve={reserveCoercesLine && sample.status !== "failed"}
      />

      {sample.status === "completed" ? (
        <JudgePanel
          judgment={judgment}
          manualRating={manualRating}
          runId={runId}
          sampleId={sample.id}
          showJudgingIndicator={runJudgingInFlight}
        />
      ) : null}
    </figcaption>
  </figure>
);
