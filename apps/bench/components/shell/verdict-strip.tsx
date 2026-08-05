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

const Cell = ({ readout }: { readonly readout: Readout }) => (
  <div
    className={cn(
      "flex min-w-0 flex-col justify-center gap-0.5 border-border-soft px-4 first:pl-0 md:border-l md:first:border-l-0",
      readout.secondary === true ? "md:max-lg:hidden" : ""
    )}
  >
    <span className="flex items-baseline gap-1.5">
      <span className="font-mono text-[11px] tracking-[0.08em] text-muted uppercase">
        {readout.label}
      </span>
      {readout.pick ? (
        <span className="bench-numeric text-[16px] leading-none font-medium text-ink">
          {readout.format(readout.pick)}
        </span>
      ) : null}
      {readout.pick && readout.unit !== undefined ? (
        <span className="bench-numeric text-[11px] text-muted">
          {readout.unit}
        </span>
      ) : null}
    </span>
    <span className="truncate font-mono text-[11px] text-muted">
      {readout.pick ? readout.pick.modelAlias : readout.emptyLabel}
    </span>
  </div>
);

/** The run's own flags, on the strip's trailing edge — status, mock, the
 * contention mark, staleness, and the aspect-coercion warning. They were a
 * header block on the old results page; the shell has no header to put them
 * in and they belong beside the verdicts they qualify. */
const RunFlags = ({ run }: { readonly run: RunSummary }) => (
  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 pl-4">
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
  const readouts: Readout[] = [
    {
      emptyLabel: "no timings yet",
      format: (pick) => formatMs(Number(pick.value)),
      label: "fastest",
      pick: data?.fastest ?? null,
    },
    {
      emptyLabel: "no costs yet",
      format: (pick) => formatUsd(Math.round(Number(pick.value))),
      label: "cheapest",
      pick: data?.cheapest ?? null,
    },
    {
      emptyLabel: "rate some images",
      format: (pick) => `★${Number(pick.value).toFixed(1)}`,
      label: "best",
      pick: data?.bestQuality ?? null,
    },
    {
      emptyLabel: "rate some images",
      format: (pick) => Number(pick.value).toFixed(0),
      label: "value",
      pick: data?.bestValue ?? null,
      secondary: true,
      unit: "★/$",
    },
  ];

  return (
    <div className="order-1 grid shrink-0 grid-cols-2 gap-y-3 border-b border-border px-3 py-3 md:flex md:h-16 md:items-stretch md:gap-y-0 md:px-4 md:py-0">
      {readouts.map((readout) => (
        <Cell key={readout.label} readout={readout} />
      ))}
      <div className="col-span-2 ml-auto flex items-center max-md:justify-start">
        {run === null ? null : <RunFlags run={run} />}
      </div>
    </div>
  );
};
