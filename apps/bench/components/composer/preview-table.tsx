"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUsd } from "@/lib/format";
import type { PreviewResult } from "@/lib/runs/types";

interface PreviewTableProps {
  readonly preview: PreviewResult;
}

/** The dry-run result: per-model endpoint, dropped/coerced params, and
 * worst-case cost — zero fal calls to produce this (`BRIEF.md`, UI section).
 * A failed model renders its own row instead of taking the table down, the
 * same per-model isolation `mock-engine.ts`'s `previewOneModel` guarantees
 * server-side.
 *
 * The endpoint, the dropped/coerced params and the costs are all the user's
 * own objects (`docs/design/specs/design-bench.md`, Abstraction rules), so
 * they are shown verbatim rather than summarised — this table exists
 * precisely so nothing about the request is a surprise. */
export const PreviewTable = ({ preview }: PreviewTableProps) => (
  <div className="flex flex-col gap-4">
    {preview.failedCount > 0 ? (
      <p className="rounded-lg border border-border border-l-2 border-l-warn bg-surface-soft px-3.5 py-3 text-[13px] text-ink">
        <span className="bench-numeric">{preview.failedCount}</span> of{" "}
        <span className="bench-numeric">{preview.models.length}</span> model
        {preview.failedCount === 1 ? "" : "s"} could not be aligned and will be
        excluded from the run — see the rows below.
      </p>
    ) : null}
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Model</TableHead>
          <TableHead>Sends</TableHead>
          <TableHead>Drops</TableHead>
          <TableHead>Coerces</TableHead>
          <TableHead className="text-right">p95</TableHead>
          <TableHead className="text-right">Est / image</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {preview.models.map((model) => (
          <TableRow key={model.alias}>
            <TableCell>
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[13px] text-ink">
                  {model.alias}
                </span>
                <span className="text-[11px] text-muted">
                  {model.modelName}
                </span>
                {model.usesQueue ? (
                  <Badge variant="warn">queue ±3s</Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="font-mono text-[13px] text-muted">
              {model.ok ? (
                model.endpoint
              ) : (
                <Badge variant="bad">
                  {model.errorMessage ?? "alignment failed"}
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-[13px] text-muted">
              {model.dropped.length === 0
                ? "none"
                : model.dropped.map((entry) => entry.param).join(", ")}
            </TableCell>
            <TableCell className="text-[13px] text-muted">
              {model.coerced.length === 0
                ? "none"
                : model.coerced
                    .map(
                      (entry) => `${entry.param}: ${entry.from} → ${entry.to}`
                    )
                    .join("; ")}
            </TableCell>
            <TableCell className="bench-numeric text-right text-[13px] text-muted">
              {model.speedP95Seconds === null
                ? "timeout floor"
                : `${model.speedP95Seconds}s`}
            </TableCell>
            <TableCell className="bench-numeric text-right text-[13px] text-ink">
              {formatUsd(Math.round(model.worstCaseCostUsd * 1_000_000))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
