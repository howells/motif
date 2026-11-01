"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isUniformAspect } from "@/lib/aspect";
import { formatSeconds, formatUsd } from "@/lib/format";
import { modelNameOf } from "@/lib/model-names";
import type { RunDetail, RunStatus } from "@/lib/runs/types";
import type {
  ModelQuality,
  VerdictPick,
  VerdictStripData,
} from "@/lib/verdicts";

interface Readout {
  readonly empty: string;
  readonly label: string;
  readonly pick: VerdictPick | null;
  readonly value: (pick: VerdictPick) => string;
}

/** One leader: what it is, the figure, and the Model that holds it. The
 * answer's two lines are the same shape whether or not there is an answer, so
 * the strip keeps its height before anything has been rated. */
const Cell = ({ readout }: { readonly readout: Readout }) => (
  <div className="flex min-w-0 flex-col md:flex-1 md:basis-0">
    <span className="text-muted type-small">{readout.label}</span>
    {readout.pick === null ? (
      <span className="text-muted type-small">{readout.empty}</span>
    ) : (
      <span className="type-small flex flex-col tabular-nums">
        <span>{readout.value(readout.pick)}</span>
        <span className="font-medium">
          {modelNameOf(readout.pick.modelAlias)}
        </span>
      </span>
    )}
  </div>
);

const STATUS_WORD: Record<RunStatus, string> = {
  cancelled: "Cancelled",
  completed: "Completed",
  failed: "Failed",
  partial: "Partial",
  pending: "Waiting",
  running: "Running",
};

const STATUS_TONE: Record<RunStatus, string> = {
  cancelled: "text-muted",
  completed: "text-ok",
  failed: "text-bad",
  partial: "text-bad",
  pending: "text-muted",
  running: "text-ink",
};

/** The run's own state on the strip's trailing edge: its status and how far it
 * got, and the marks that qualify its numbers. */
const RunState = ({ detail }: { readonly detail: RunDetail }) => {
  const { run, samples } = detail;
  const settled = samples.filter(
    (sample) => sample.status === "completed" || sample.status === "failed"
  ).length;
  const completed = samples.filter(
    (sample) => sample.status === "completed"
  ).length;
  const done = run.status === "running" ? settled : completed;

  return (
    <div className="type-small flex shrink-0 flex-col md:w-36 md:items-end">
      <span className="flex items-center gap-2 tabular-nums">
        <span className={`font-medium ${STATUS_TONE[run.status]}`}>
          {STATUS_WORD[run.status]}
        </span>
        <span className="text-muted">
          {done} of {samples.length}
        </span>
      </span>
      {run.concurrency > 1 ? (
        <Tooltip>
          <TooltipTrigger className="text-muted cursor-help tabular-nums">
            Contended ×{run.concurrency}
          </TooltipTrigger>
          <TooltipContent>
            Images ran together, so times include waiting on each other
          </TooltipContent>
        </Tooltip>
      ) : null}
      {isUniformAspect(run.aspect) ? null : (
        <span className="text-muted">Framing not uniform</span>
      )}
      {run.isMock ? <span className="text-muted">Mock</span> : null}
      {run.stale ? <span className="text-bad">Stale</span> : null}
    </div>
  );
};

/** The four leaders of a run (fastest, cheapest, highest rated, best value)
 * and the run's state. Quality is the mean of your star ratings, so an unrated
 * run says "Not rated", never a zero. */
export const VerdictStrip = ({
  data,
  detail,
  quality,
}: {
  readonly data: VerdictStripData | null;
  readonly detail: RunDetail;
  readonly quality: readonly ModelQuality[];
}) => {
  const starsOf = (pick: VerdictPick): number | null =>
    quality.find((entry) => entry.modelAlias === pick.modelAlias)?.meanStars ??
    null;

  const readouts: Readout[] = [
    {
      empty: "No data",
      label: "Fastest",
      pick: data?.fastest ?? null,
      value: (pick) => formatSeconds(Number(pick.value)),
    },
    {
      empty: "No data",
      label: "Cheapest",
      pick: data?.cheapest ?? null,
      value: (pick) => formatUsd(Math.round(Number(pick.value))),
    },
    {
      empty: "Not rated",
      label: "Highest rated",
      pick: data?.bestQuality ?? null,
      value: (pick) => `${Number(pick.value).toFixed(1)} ★`,
    },
    {
      empty: "Not rated",
      label: "Best value",
      pick: data?.bestValue ?? null,
      value: (pick) => `${(starsOf(pick) ?? 0).toFixed(1)} ★`,
    },
  ];

  return (
    <div className="border-border flex flex-col gap-4 border-b px-4 py-4 md:flex-row md:gap-6 md:px-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:flex md:flex-1 md:gap-6">
        {readouts.map((readout) => (
          <Cell key={readout.label} readout={readout} />
        ))}
      </div>
      <RunState detail={detail} />
    </div>
  );
};
