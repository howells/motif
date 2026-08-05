"use client";

import { ScrollFrame } from "@patternmode/scrollframe";

import { RunStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
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
        "flex w-full cursor-pointer flex-col gap-1 border-t border-l-2 border-t-border-soft px-3 py-2.5 text-left transition-colors duration-150",
        isSelected
          ? "border-l-accent bg-surface-soft"
          : "border-l-transparent hover:bg-surface-soft"
      )}
      onClick={() => {
        onSelect(run.id);
      }}
      type="button"
    >
      {/* The selected entry shows its prompt in full: it is the only place
          the run's own subject appears once the composer above became a
          forward-looking draft rather than a description of what is on
          screen. */}
      <span
        className={cn(
          "text-[13px] leading-[1.45] text-ink",
          isSelected ? "" : "line-clamp-2"
        )}
      >
        {run.prompt}
      </span>
      <span className="bench-numeric text-[11px] text-muted">
        {run.models.length} model{run.models.length === 1 ? "" : "s"} ·{" "}
        {formatRelativeToNow(run.createdAt)}
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {progress === null ? (
          <RunStatusBadge short status={run.status} />
        ) : (
          <Badge variant="warn">
            <span className="bench-numeric">
              {progress.done} of {progress.total}
            </span>
          </Badge>
        )}
        {run.isMock ? <Badge>mock</Badge> : null}
        {run.stale ? <Badge variant="bad">stale</Badge> : null}
        <span className="bench-numeric ml-auto text-[11px] text-muted">
          {formatUsd(run.costActualMicros ?? run.costEstimatedMicros)}
          {run.costActualMicros === null ? " est" : ""}
        </span>
      </span>
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

const RailHeading = () => (
  <span className="font-mono text-[11px] tracking-[0.08em] text-muted uppercase">
    Runs
  </span>
);

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
