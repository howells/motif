"use client";

import { isUniformAspect } from "@/lib/aspect";
import { formatDateTime, formatUsd } from "@/lib/format";
import type { RunSummary } from "@/lib/runs/types";

const STATUS_BADGE_CLASS: Record<string, string> = {
  completed: "badge-good",
  failed: "badge-bad",
  partial: "badge-warn",
  running: "badge-warn",
};

interface RunHeaderProps {
  readonly onJudgeClick: () => void;
  readonly judgePending: boolean;
  readonly run: RunSummary;
}

/** Run identity, status/contention/mock/stale badges, the run spec summary,
 * and the judge-trigger button — split out of `RunDetail` purely to keep
 * that component's own body short. */
export const RunHeader = ({
  run,
  onJudgeClick,
  judgePending,
}: RunHeaderProps) => (
  <div className="card">
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      <span className={`badge ${STATUS_BADGE_CLASS[run.status] ?? ""}`}>
        {run.status}
      </span>
      {run.isMock ? <span className="badge badge-mock">mock</span> : null}
      {run.concurrency > 1 ? (
        <span className="badge badge-warn">contended (×{run.concurrency})</span>
      ) : null}
      {run.stale ? <span className="badge badge-bad">stale</span> : null}
      <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{run.id}</span>
    </div>
    <p style={{ fontSize: 14, margin: "10px 0" }}>{run.prompt}</p>
    {isUniformAspect(run.aspect) ? null : (
      <div className="warning-banner">
        This run used aspect {run.aspect}, not the uniform <code>1:1</code> —
        models were framed differently, so the quality comparisons below are not
        fully apples-to-apples.
      </div>
    )}
    <div className="run-meta">
      <span>
        {run.models.length} models × {run.samplesPerModel} samples
      </span>
      <span>aspect {run.aspect}</span>
      <span>resolution {run.resolution}</span>
      <span>seed {run.seed ?? "unset"}</span>
      <span>created {formatDateTime(run.createdAt)}</span>
      <span>
        cost {formatUsd(run.costActualMicros ?? run.costEstimatedMicros)}
        {run.costActualMicros === null ? " (est.)" : ""}
      </span>
    </div>
    <div className="btn-row" style={{ marginTop: 12 }}>
      <button
        className="btn"
        disabled={
          run.status === "running" ||
          run.judgingStatus === "running" ||
          judgePending
        }
        onClick={onJudgeClick}
        type="button"
      >
        {run.judgingStatus === "running"
          ? "Judging…"
          : run.judgingStatus === "done"
            ? "Re-judge"
            : "Judge this run"}
      </button>
    </div>
  </div>
);
