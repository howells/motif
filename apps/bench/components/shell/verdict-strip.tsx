"use client";

import { RunStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isUniformAspect } from "@/lib/aspect";
import { formatMs, formatUsd } from "@/lib/format";
import type { RunSummary } from "@/lib/runs/types";
import { cn } from "@/lib/utils";
import type { VerdictPick, VerdictStripData } from "@/lib/verdicts";

interface Readout {
  readonly emptyLabel: string;
  readonly format: (pick: VerdictPick) => string;
  readonly label: string;
  readonly pick: VerdictPick | null;
  /** Hidden on a narrow *pane* — between `md` (where the strip becomes one
   * fixed 64px row that must never wrap) and `lg` (where there is room for
   * all four again). Below `md` the strip is a 2×2 grid with room to spare,
   * so nothing is dropped there. */
  readonly secondary?: boolean;
  readonly unit?: string;
}

/** One verdict, in two lines that hold the same shape whether or not there is
 * an answer yet.
 *
 * The band used to put the label and the value on one line and the model
 * underneath, which meant an unrated run had *nothing* on its first line: two
 * cells carried 16px numerals and two carried empty space above a grey
 * sentence, so the strip read as half-broken rather than half-answered. Label
 * above, answer below — the answer line is the value and the model it belongs
 * to, or the "not yet" sentence sitting on exactly the same baseline. */
const Cell = ({ readout }: { readonly readout: Readout }) => (
  <div
    className={cn(
      // `flex-1 basis-0` rather than intrinsic width: four intrinsic cells
      // left roughly 800px of empty band between the last verdict and the run
      // flags at 1440px, which read as a missing region rather than as space.
      "border-border-soft flex min-w-0 flex-col justify-center gap-1 md:flex-1 md:basis-0 md:border-l md:px-4 md:first:border-l-0 md:first:pl-0",
      readout.secondary === true ? "md:max-lg:hidden" : ""
    )}
  >
    {/* Sentence case in the body font. `FASTEST` / `CHEAPEST` / `BEST` /
        `VALUE` as tracked uppercase mono put four eyebrows across the widest
        band on screen, competing with the figures they label — and repeated
        alongside the rail heading and every table header, the treatment stops
        being a signal and becomes texture. The label is a caption; the number
        is the subject, and the 17px mono figure below already says so. */}
    <span className="text-muted text-[12px] leading-[14px]">
      {readout.label}
    </span>
    {/* A fixed 18px answer line, whether it holds a 17px numeral or the 13px
        "not yet" sentence. Sized by content, the answered and unanswered cells
        came out different heights, and `justify-center` then pushed their
        labels to different baselines — four verdicts of one band sitting on
        two different lines. */}
    <span className="flex h-[18px] min-w-0 items-baseline gap-1.5">
      {readout.pick ? (
        <>
          <span className="bench-numeric text-ink text-[17px] leading-[18px] font-medium">
            {readout.format(readout.pick)}
          </span>
          {readout.unit === undefined ? null : (
            <span className="text-muted shrink-0 text-[11px]">
              {readout.unit}
            </span>
          )}
          {/* The alias is a name, read on its own — never scanned down a
              column — so it takes the body font. Only the figure beside it is
              mono, because only the figure is compared. */}
          <span className="text-muted truncate text-[12px]">
            {readout.pick.modelAlias}
          </span>
        </>
      ) : (
        <span className="text-muted truncate text-[13px] leading-[18px]">
          {readout.emptyLabel}
        </span>
      )}
    </span>
  </div>
);

/** The run's own flags, on the strip's trailing edge — status, mock, the
 * contention mark, staleness, and the aspect-coercion warning. They were a
 * header block on the old results page; the shell has no header to put them
 * in and they belong beside the verdicts they qualify. */
const RunFlags = ({ run }: { readonly run: RunSummary }) => (
  <div className="flex shrink-0 flex-wrap items-center gap-1.5 md:justify-end md:pl-4">
    <RunStatusBadge short status={run.status} />
    {run.isMock ? <Badge>mock</Badge> : null}
    {run.concurrency > 1 ? (
      <Tooltip>
        <TooltipTrigger className="cursor-help">
          <Badge variant="warn">contended ×{run.concurrency}</Badge>
        </TooltipTrigger>
        <TooltipContent>
          This run generated more than one image at a time, so its latencies
          include queueing against each other and are not comparable with a
          serial run.
        </TooltipContent>
      </Tooltip>
    ) : null}
    {run.stale ? (
      <Badge variant="bad">stale — no executor to resume</Badge>
    ) : null}
    {isUniformAspect(run.aspect) ? null : (
      <Tooltip>
        <TooltipTrigger className="cursor-help">
          <Badge variant="warn">framing not uniform</Badge>
        </TooltipTrigger>
        <TooltipContent>
          This run used {run.aspect} rather than 1:1, and the three sizing
          dialects disagree there — models were framed differently, so the
          quality comparisons here are not fully apples-to-apples.
        </TooltipContent>
      </Tooltip>
    )}
  </div>
);

/** Pinned at the top of the main pane and never scrolled away, because the
 * verdicts are the answer to the question this tool exists for
 * (`docs/design/specs/design-bench-shell.md`). Hairline rules between
 * readouts, no boxes — the band was never four cards and is not four cards
 * now that it is 64px tall.
 *
 * Quality is the mean of *manual star ratings*; the auto-judge was
 * deliberately removed. An unrated run says "rate some images" rather than
 * showing a zero, because zero is a different and wrong claim. */
export const VerdictStrip = ({
  data,
  run,
}: {
  readonly data: VerdictStripData | null;
  readonly run: RunSummary | null;
}) => {
  // Both quality verdicts derive from the same star ratings, so before any
  // rating exists they were two cells side by side reading the identical
  // sentence — the same instruction printed twice, which reads as a rendering
  // fault rather than as an invitation. Unrated, they collapse into one slot
  // that asks for the rating once and lets fastest and cheapest take the room.
  const quality = data?.bestQuality ?? null;
  const value = data?.bestValue ?? null;
  const qualityReadouts: Readout[] =
    quality === null && value === null
      ? [
          {
            emptyLabel: "rate some images to rank them",
            format: () => "",
            label: "Quality",
            pick: null,
          },
        ]
      : [
          {
            emptyLabel: "not rated yet",
            format: (pick) => `★${Number(pick.value).toFixed(1)}`,
            label: "Best rated",
            pick: quality,
          },
          {
            emptyLabel: "not rated yet",
            format: (pick) => Number(pick.value).toFixed(0),
            label: "Best value",
            pick: value,
            secondary: true,
            unit: "★/$",
          },
        ];

  const readouts: Readout[] = [
    {
      emptyLabel: "no timings yet",
      format: (pick) => formatMs(Number(pick.value)),
      label: "Fastest",
      pick: data?.fastest ?? null,
    },
    {
      emptyLabel: "no costs yet",
      format: (pick) => formatUsd(Math.round(Number(pick.value))),
      label: "Cheapest",
      pick: data?.cheapest ?? null,
    },
    ...qualityReadouts,
  ];

  return (
    // Below `md` the cells drop their horizontal padding entirely and let the
    // grid's own gap do the spacing. `first:pl-0` alone used to indent cells
    // 3 and 4 by 16px against cells 1 and 2 directly above them, so the two
    // rows of a 2×2 verdict grid did not share a left edge.
    <div className="border-border order-1 grid shrink-0 grid-cols-2 gap-x-6 gap-y-4 border-b px-3 py-3.5 md:flex md:h-16 md:items-stretch md:gap-y-0 md:px-4 md:py-0">
      {readouts.map((readout) => (
        <Cell key={readout.label} readout={readout} />
      ))}
      {run === null ? null : (
        <div className="col-span-2 flex items-center md:ml-auto">
          <RunFlags run={run} />
        </div>
      )}
    </div>
  );
};
