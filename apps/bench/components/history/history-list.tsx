"use client";

import Link from "next/link";

import { formatDateTime, formatUsd } from "@/lib/format";
import { useRuns } from "@/lib/queries";

const STATUS_BADGE_CLASS: Record<string, string> = {
  completed: "badge-good",
  failed: "badge-bad",
  partial: "badge-warn",
  running: "badge-warn",
};

/** History list — flags stale `running` runs (`docs/arc/bench/BRIEF.md`, UI
 * section). This phase has no persisted Mastra workflow state to `restart()`
 * (`docs/arc/bench/BRIEF.md` precedent table: `listActiveWorkflowRuns()` /
 * `restart()` are unverified APIs, and there is no database this phase to
 * back them regardless), so a stale run surfaces as a labeled dead end
 * rather than an action that would silently do nothing. */
export const HistoryList = () => {
  const { data, isLoading, isError } = useRuns();

  if (isLoading) {
    return <div className="empty-state">Loading run history…</div>;
  }
  if (isError) {
    return (
      <div className="empty-state">
        Could not load run history. The app&apos;s own store may be unavailable.
      </div>
    );
  }
  if (!data || data.runs.length === 0) {
    return (
      <div className="empty-state">
        No runs yet — configure a run above and preview it to get started.
      </div>
    );
  }

  return (
    <div>
      {data.runs.map((run) => (
        <div className="history-row" key={run.id}>
          <div className="prompt">
            <Link href={`/runs/${run.id}`}>{run.prompt}</Link>
            <div style={{ color: "var(--text-faint)", fontSize: 11 }}>
              {run.models.length} models × {run.samplesPerModel} samples ·{" "}
              {formatDateTime(run.createdAt)}
            </div>
          </div>
          <span className={`badge ${STATUS_BADGE_CLASS[run.status] ?? ""}`}>
            {run.status}
          </span>
          {run.stale ? (
            <span className="badge badge-bad">
              stale — no executor to resume
            </span>
          ) : (
            <span />
          )}
          {run.isMock ? (
            <span className="badge badge-mock">mock</span>
          ) : (
            <span />
          )}
          <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
            {formatUsd(run.costActualMicros ?? run.costEstimatedMicros)}
            {run.costActualMicros === null ? " (est.)" : ""}
          </span>
        </div>
      ))}
    </div>
  );
};
