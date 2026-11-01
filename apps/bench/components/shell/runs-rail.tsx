"use client";

import { PlusIcon, XIcon } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatRunDate, formatUsd } from "@/lib/format";
import { useRuns } from "@/lib/queries";
import type { RunStatus, RunSummary } from "@/lib/runs/types";
import { cn } from "@/lib/utils";

interface RunsRailProps {
  readonly onNewRun: () => void;
  readonly onSelect: (runId: string) => void;
  readonly selectedRunId: string | null;
}

/** Status as a disc: green when it finished, red when it did not, ink while it
 * runs. The word is on the run itself, so colour never carries it alone. */
const STATUS_TONE: Record<RunStatus, string> = {
  cancelled: "bg-faint",
  completed: "bg-ok",
  failed: "bg-bad",
  partial: "bg-bad",
  pending: "bg-faint",
  running: "bg-ink",
};

const StatusDot = ({ status }: { readonly status: RunStatus }) => (
  <span
    aria-hidden="true"
    className={cn("size-2 shrink-0 rounded-full", STATUS_TONE[status])}
  />
);

/** One run: its prompt on a line, then when it was made and what it cost.
 * Every run tends to carry the same prompt, so the date is what tells them
 * apart. */
const RunEntry = ({
  detailed,
  isSelected,
  onSelect,
  run,
}: {
  readonly detailed: boolean;
  readonly isSelected: boolean;
  readonly onSelect: (runId: string) => void;
  readonly run: RunSummary;
}) => (
  <li>
    <button
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "rounded-control flex w-full cursor-pointer flex-col gap-1 p-3 text-left transition-colors duration-150",
        isSelected ? "bg-surface" : "hover:bg-surface"
      )}
      onClick={() => {
        onSelect(run.id);
      }}
      type="button"
    >
      <span className="flex items-center gap-2">
        <StatusDot status={run.status} />
        <span className="type-small truncate">{run.prompt}</span>
      </span>
      {detailed ? (
        <span className="text-muted type-small pl-4 tabular-nums">
          {run.models.length} model{run.models.length === 1 ? "" : "s"} ·{" "}
          {run.samplesPerModel} sample{run.samplesPerModel === 1 ? "" : "s"} ·{" "}
          {run.aspect}
        </span>
      ) : null}
      <span className="text-muted type-small flex justify-between pl-4 tabular-nums">
        <span>{formatRunDate(run.createdAt)}</span>
        <span>
          {formatUsd(run.costActualMicros ?? run.costEstimatedMicros)}
        </span>
      </span>
    </button>
  </li>
);

const RunList = ({
  detailed = false,
  onSelect,
  selectedRunId,
}: Pick<RunsRailProps, "onSelect" | "selectedRunId"> & {
  readonly detailed?: boolean;
}) => {
  const { data, isError, isLoading } = useRuns();
  const runs = data?.runs ?? [];

  if (isLoading) {
    return <p className="text-muted type-small px-3 py-3">Loading runs</p>;
  }
  if (isError) {
    return <p className="text-bad type-small px-3 py-3">Could not load runs</p>;
  }
  if (runs.length === 0) {
    return <p className="text-muted type-small px-3 py-3">No runs yet</p>;
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {runs.map((run) => (
        <RunEntry
          detailed={detailed}
          isSelected={run.id === selectedRunId}
          key={run.id}
          onSelect={onSelect}
          run={run}
        />
      ))}
    </ul>
  );
};

const NewRunButton = ({ onNewRun }: Pick<RunsRailProps, "onNewRun">) => (
  <button className="app-button w-full" onClick={onNewRun} type="button">
    <PlusIcon aria-hidden="true" size={18} strokeWidth={1.5} />
    New run
  </button>
);

/** The heading with the count of runs beside it. */
const RailHeading = () => {
  const { data } = useRuns();
  const count = data?.runs.length;
  return (
    <>
      <span>Runs</span>
      {count === undefined ? null : (
        <span className="text-muted type-small tabular-nums">{count}</span>
      )}
    </>
  );
};

/** Every run, newest first, in a column of its own beside the pane. It holds
 * its place as the page scrolls, and scrolls on its own when the list is
 * longer than the screen. */
export const RunsRail = ({
  onNewRun,
  onSelect,
  selectedRunId,
}: RunsRailProps) => (
  <aside
    aria-label="Runs"
    className="border-border bg-background hidden w-[280px] shrink-0 flex-col border-r md:sticky md:top-0 md:flex md:h-dvh"
  >
    <div className="type-title flex h-[3.75rem] shrink-0 items-center justify-between px-6">
      <RailHeading />
    </div>
    <div className="px-6 pb-4">
      <NewRunButton onNewRun={onNewRun} />
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
      <RunList onSelect={onSelect} selectedRunId={selectedRunId} />
    </div>
  </aside>
);

/** Below `md` the column has nowhere to live, so it is a sheet behind the
 * composer's Runs button. */
export const RunsSheet = ({
  onNewRun,
  onOpenChange,
  open,
  onSelect,
  selectedRunId,
}: RunsRailProps & {
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent
      aria-describedby={undefined}
      className="h-[calc(100dvh-var(--bar)-var(--spacing-24))]"
    >
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 pt-4 pb-4">
        <DialogTitle className="flex items-baseline gap-2">
          <RailHeading />
        </DialogTitle>
        <button
          aria-label="Close"
          className="board-quiet hover:bg-surface"
          onClick={() => {
            onOpenChange(false);
          }}
          type="button"
        >
          <XIcon aria-hidden="true" size={18} strokeWidth={1.5} />
        </button>
      </div>
      <div className="shrink-0 px-4 pb-4">
        <button
          className="app-button is-primary w-full"
          onClick={onNewRun}
          type="button"
        >
          <PlusIcon aria-hidden="true" size={18} strokeWidth={1.5} />
          New run
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <RunList detailed onSelect={onSelect} selectedRunId={selectedRunId} />
      </div>
    </DialogContent>
  </Dialog>
);
