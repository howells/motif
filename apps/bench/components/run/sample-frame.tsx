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

interface SampleFrameProps {
  /** The run's requested aspect as a Tailwind ratio class. Held constant
   * across pending / failed / resolved so nothing reflows when an image
   * lands (`docs/design/specs/design-bench.md`, States). */
  readonly aspectClassName: string;
  readonly contended: boolean;
  readonly judgment: JudgmentRecord | undefined;
  readonly manualRating: ManualRatingRecord | undefined;
  readonly onOpen: () => void;
  readonly runId: string;
  readonly runJudgingInFlight: boolean;
  readonly sample: SampleRecord;
}

/** One cell of the contact sheet: the image at the run's aspect with zero
 * radius, and its annotation directly beneath in mono — not a card
 * (`docs/design/specs/design-bench.md`). The hairlines are the cell's own
 * top/left borders, which tile into the sheet's lattice.
 *
 * The contention and queue-granularity marks sit *beside the latency* rather
 * than floating over the image, because that is the number they qualify:
 * both mean "this figure is not comparable to the others in the column".
 *
 * Thumbnails go through the Next image optimizer (`sizes` set for the grid);
 * only the lightbox's full-res view opts out — see `lightbox.tsx`. */
export const SampleFrame = ({
  aspectClassName,
  contended,
  judgment,
  manualRating,
  onOpen,
  runId,
  runJudgingInFlight,
  sample,
}: SampleFrameProps) => (
  <figure className="m-0 flex min-w-0 flex-col border-t border-l border-plate-edge bg-plate">
    <div className={cn("relative w-full bg-plate", aspectClassName)}>
      {sample.status === "completed" && sample.imageUrl !== null ? (
        <button
          // `relative`, not decoration: `next/image` with `fill` positions
          // against its *direct* parent, and a static button would silently
          // size the thumbnail against the page instead of the frame.
          className="relative block size-full cursor-zoom-in border-0 bg-transparent p-0 focus-visible:outline-plate-ink"
          onClick={onOpen}
          type="button"
        >
          <Image
            alt={`${sample.modelName ?? sample.modelAlias}, sample ${sample.sampleIndex}`}
            className="rounded-frame object-cover"
            fill
            sizes="(min-width: 1024px) 280px, (min-width: 640px) 33vw, 50vw"
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

    <figcaption className="flex flex-col gap-1.5 px-3 py-3">
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

      {sample.droppedParams.length > 0 ? (
        <span className="font-mono text-[11px] text-plate-muted">
          drops {sample.droppedParams.join(", ")}
        </span>
      ) : null}

      {sample.coercedParams.length > 0 ? (
        <span className="font-mono text-[11px] text-plate-muted">
          coerces {sample.coercedParams.map((entry) => entry.param).join(", ")}
        </span>
      ) : null}

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
