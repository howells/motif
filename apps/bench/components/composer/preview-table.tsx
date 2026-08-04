"use client";

import { formatUsd } from "@/lib/format";
import type { PreviewResult } from "@/lib/runs/types";

interface PreviewTableProps {
  readonly preview: PreviewResult;
}

/** The dry-run result: per-model endpoint, dropped/coerced params, and
 * worst-case cost — zero fal calls to produce this (`BRIEF.md`, UI section).
 * A failed model renders its own row instead of taking the table down, the
 * same per-model isolation `mock-engine.ts`'s `previewOneModel` guarantees
 * server-side. */
export const PreviewTable = ({ preview }: PreviewTableProps) => (
  <div>
    {preview.failedCount > 0 ? (
      <div className="warning-banner">
        {preview.failedCount} of {preview.models.length} model
        {preview.failedCount === 1 ? "" : "s"} could not be aligned and will be
        excluded from the run — see the rows below.
      </div>
    ) : null}
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Endpoint</th>
            <th>Dropped params</th>
            <th>Coerced params</th>
            <th>p95</th>
            <th className="numeric">Worst-case / image</th>
          </tr>
        </thead>
        <tbody>
          {preview.models.map((model) => (
            <tr className={model.ok ? "" : "row-failed"} key={model.alias}>
              <td>
                <div>{model.modelName}</div>
                <div style={{ color: "var(--text-faint)", fontSize: 11 }}>
                  {model.alias}
                  {model.usesQueue ? (
                    <span
                      className="badge badge-warn"
                      style={{ marginLeft: 6 }}
                    >
                      queue ±3s
                    </span>
                  ) : null}
                </div>
              </td>
              <td style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>
                {model.ok ? (
                  model.endpoint
                ) : (
                  <span className="badge badge-bad">
                    {model.errorMessage ?? "alignment failed"}
                  </span>
                )}
              </td>
              <td>
                {model.dropped.length === 0
                  ? "—"
                  : model.dropped.map((entry) => entry.param).join(", ")}
              </td>
              <td>
                {model.coerced.length === 0
                  ? "—"
                  : model.coerced
                      .map(
                        (entry) => `${entry.param}: ${entry.from} → ${entry.to}`
                      )
                      .join("; ")}
              </td>
              <td className="numeric">
                {model.speedP95Seconds === null
                  ? "timeout floor"
                  : `${model.speedP95Seconds}s`}
              </td>
              <td className="numeric">
                {formatUsd(Math.round(model.worstCaseCostUsd * 1_000_000))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
