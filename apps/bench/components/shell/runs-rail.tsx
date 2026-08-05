"use client";

import { ScrollFrame } from "@patternmode/scrollframe";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatRelativeToNow, formatUsd } from "@/lib/format";
import { useRuns } from "@/lib/queries";
import type { RunSummary } from "@/lib/runs/types";
import { cn } from "@/lib/utils";

/** How far a run has got, for the entry the main pane is showing. The list
 * endpoint returns no per-sample counts, so only the selected run — whose
 * detail the shell already has — can show `7 of 24`; every other running run
 * shows its status badge alone. */
export interface RailProgress {
  readonly done: number;
  readonly total: number;
}

interface RunsRailProps {
  readonly onSelect: (runId: string) => void;
  readonly progress: RailProgress | null;
  readonly selectedRunId: string | null;
}

/** Status as a 5px disc rather than an outlined pill.
 *
 * Nine pills stacked down a 220px column were the loudest thing in the rail
 * and the least important — a rounded border, its own padding and a mono face
 * spent on a word that repeats on almost every row. The disc keeps the colour
 * cue at a fraction of the weight, and the status *word* still appears in the
 * meta line below it, so this never carries meaning by colour alone
 * (`docs/design/specs/design-bench.md`: "Every status carries a text label"). */
const STATUS_TONE: Record<string, string> = {
  completed: "bg-ok",
  failed: "bg-bad",
  partial: "bg-warn",
  running: "bg-warn",
};

const StatusDot = ({ status }: { readonly status: string }) => (
  <span
    aria-hidden="true"
    className={cn(
      "size-[5px] shrink-0 rounded-full",
      STATUS_TONE[status] ?? "bg-muted"
    )}
  />
);

/** One run, at a glance.
 *
 * Every run in this tool tends to carry the *same* prompt — it is the constant
 * the comparison holds still. Leading each entry with it therefore printed one
 * identical paragraph nine times and buried the only things that actually
 * differ: how many models, when, what it cost, how it ended. So the entry now
 * leads with the shape of the run and keeps the prompt for the selected entry
 * alone, as a caption rather than a headline. */
const RunEntry = ({
  isSelected,
  onSelect,
  progress,
  run,
}: {
  readonly isSelected: boolean;
  readonly onSelect: (runId: string) => void;
  readonly progress: RailProgress | null;
  readonly run: RunSummary;
}) => (
  <li>
    <button
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-0.5 border-t border-l-2 border-t-border-soft px-3 py-2 text-left transition-colors duration-150",
        isSelected
          ? "border-l-accent bg-surface-soft"
          : "border-l-transparent hover:bg-surface-soft"
      )}
      onClick={() => {
        onSelect(run.id);
      }}
      type="button"
    >
      <span className="flex w-full items-center gap-1.5">
        <StatusDot status={run.status} />
        <span className="text-[13px] text-ink">
          {run.models.length} model{run.models.length === 1 ? "" : "s"}
        </span>
        {/* The one figure in the rail that keeps mono. Costs right-align into
            a single column nine rows deep and are read against each other —
            "which run was the expensive one" is the question the column
            answers, and tabular figures are what let you answer it by
            scanning. Everything else here is read one row at a time. */}
        <span className="bench-numeric ml-auto text-[11px] text-muted">
          {formatUsd(run.costActualMicros ?? run.costEstimatedMicros)}
          {run.costActualMicros === null ? " est" : ""}
        </span>
      </span>

      {/* Indented past the disc so the meta line hangs off the count above it
          rather than starting a second column. */}
      <span className="flex flex-wrap items-baseline gap-x-1.5 pl-[11px] text-[11px] text-muted">
        <span>
          {progress === null
            ? run.status
            : `${progress.done} of ${progress.total}`}
        </span>
        <span aria-hidden="true">·</span>
        <span>{formatRelativeToNow(run.createdAt)}</span>
        {run.isMock ? (
          <>
            <span aria-hidden="true">·</span>
            <span>mock</span>
          </>
        ) : null}
        {run.stale ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-bad">stale</span>
          </>
        ) : null}
      </span>

      {/* The selected entry shows its prompt: it is the only place the run's
          own subject appears once the composer above became a forward-looking
          draft rather than a description of what is on screen. */}
      {isSelected ? (
        <span className="line-clamp-2 pl-[11px] text-[12px] leading-[1.45] text-muted">
          {run.prompt}
        </span>
      ) : null}
    </button>
  </li>
);

const RunList = ({ onSelect, progress, selectedRunId }: RunsRailProps) => {
  const { data, isError, isLoading } = useRuns();
  const runs = data?.runs ?? [];

  if (isLoading) {
    return <p className="px-3 py-2.5 text-[11px] text-muted">Loading runs…</p>;
  }
  if (isError) {
    return (
      <p className="px-3 py-2.5 text-[11px] leading-[1.5] text-muted">
        Could not load runs. The app&apos;s own store may be unavailable.
      </p>
    );
  }
  if (runs.length === 0) {
    return <p className="px-3 py-2.5 text-[11px] text-muted">No runs yet.</p>;
  }

  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {runs.map((run) => (
        <RunEntry
          isSelected={run.id === selectedRunId}
          key={run.id}
          onSelect={onSelect}
          progress={run.id === selectedRunId ? progress : null}
          run={run}
        />
      ))}
    </ul>
  );
};

/** Sentence case in the body font, not a tracked uppercase mono eyebrow.
 *
 * A column of runs does not need to be labelled `RUNS`; what the heading is
 * actually worth is the count, which says how much history there is without
 * the user scrolling to find out. */
const RailHeading = () => {
  const { data } = useRuns();
  const count = data?.runs.length;
  return (
    <span className="flex items-baseline gap-1.5 text-[13px] text-ink">
      Runs
      {count === undefined ? null : (
        <span className="text-[11px] text-muted">{count}</span>
      )}
    </span>
  );
};

/** Every run, newest first, in its own scroll frame — one of the shell's
 * exactly three (`docs/design/specs/design-bench-shell.md`). This is what
 * makes the app a bench rather than a form: from any result you can reach
 * every other result in one click, without leaving the screen.
 *
 * Its 64px header is deliberately the verdict strip's height, so the rule
 * under it continues the rule under the verdicts straight across the shell. */
export const RunsRail = (props: RunsRailProps) => (
  <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border md:flex">
    <div className="flex h-16 shrink-0 items-center border-b border-border px-3">
      <RailHeading />
    </div>
    <ScrollFrame
      aria-label="Runs"
      className="min-h-0 flex-1"
      fadeColor="var(--color-background)"
      fadeSize={24}
    >
      <RunList {...props} />
    </ScrollFrame>
  </aside>
);

/** Below `md` the rail has nowhere to live, so it becomes a sheet behind the
 * top bar's `Runs` button. Document scroll is permitted at this size, so the
 * sheet's list scrolls with the dialog rather than inside a fourth frame. */
export const RunsSheet = ({
  onOpenChange,
  open,
  ...props
}: RunsRailProps & {
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent className="top-0 left-0 h-dvh w-[300px] max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none border-y-0 border-l-0 p-0">
      <DialogTitle className="flex h-14 shrink-0 items-center border-b border-border px-3">
        <RailHeading />
      </DialogTitle>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RunList {...props} />
      </div>
    </DialogContent>
  </Dialog>
);
