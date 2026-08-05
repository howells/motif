"use client";

import Link from "next/link";

import { RunStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { isUniformAspect } from "@/lib/aspect";
import { formatRelativeToNow, formatUsd } from "@/lib/format";
import type { RunSummary } from "@/lib/runs/types";

interface RunHeaderProps {
  readonly run: RunSummary;
}

/** Run identity, status/contention/mock/stale badges, the run spec summary,
 * and the judge trigger.
 *
 * The workflow's internals stay hidden (`docs/design/specs/design-bench.md`,
 * Abstraction rules): no step names, no span ids, and the run id itself is
 * left in the URL rather than repeated as chrome. What is shown is what the
 * user chose — models, samples, aspect, resolution, seed — plus what it
 * cost. */
export const RunHeader = ({ run }: RunHeaderProps) => (
  <header className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
      <Link
        className="text-muted no-underline transition-colors duration-150 hover:text-ink"
        href="/"
      >
        ← Runs
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <RunStatusBadge status={run.status} />
        {run.isMock ? <Badge>mock</Badge> : null}
        {run.concurrency > 1 ? (
          <Badge variant="warn">contended ×{run.concurrency}</Badge>
        ) : null}
        {run.stale ? (
          <Badge variant="bad">stale — no executor to resume</Badge>
        ) : null}
      </div>
    </div>

    <h2 className="max-w-[68ch] leading-[1.55] font-normal">{run.prompt}</h2>

    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-soft pt-3 text-[13px] text-muted">
      <span className="bench-numeric">
        {run.models.length} model{run.models.length === 1 ? "" : "s"} ×{" "}
        {run.samplesPerModel} sample{run.samplesPerModel === 1 ? "" : "s"}
      </span>
      <span className="bench-numeric">{run.aspect}</span>
      <span className="bench-numeric">{run.resolution}</span>
      <span className="bench-numeric">seed {run.seed ?? "free"}</span>
      <span className="bench-numeric text-ink">
        {formatUsd(run.costActualMicros ?? run.costEstimatedMicros)}
        {run.costActualMicros === null ? " est" : ""}
      </span>
      <span>{formatRelativeToNow(run.createdAt)}</span>
    </div>

    {isUniformAspect(run.aspect) ? null : (
      <p className="max-w-[68ch] rounded-lg border border-border border-l-2 border-l-warn bg-surface-soft px-3.5 py-3 text-[13px] leading-[1.55] text-muted">
        <span className="text-ink">Framing was not uniform.</span> This run used{" "}
        <span className="bench-numeric">{run.aspect}</span> rather than{" "}
        <span className="bench-numeric">1:1</span>, and the three sizing
        dialects disagree there — models were framed differently, so the quality
        comparisons below are not fully apples-to-apples.
      </p>
    )}
  </header>
);
