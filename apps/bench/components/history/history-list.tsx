"use client";

import Link from "next/link";

import { Section } from "@/components/section";
import { RunStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatRelativeToNow, formatUsd } from "@/lib/format";
import { useRuns } from "@/lib/queries";

/** History list — flags stale `running` runs (`docs/arc/bench/BRIEF.md`, UI
 * section). This phase has no persisted Mastra workflow state to `restart()`
 * (`docs/arc/bench/BRIEF.md` precedent table: `listActiveWorkflowRuns()` /
 * `restart()` are unverified APIs, and there is no database this phase to
 * back them regardless), so a stale run surfaces as a labeled dead end
 * rather than an action that would silently do nothing.
 *
 * Rows are hairline-separated, not carded — the same rule rhythm the rest of
 * the page uses (`docs/design/specs/design-bench.md`). */
export const HistoryList = () => {
  const { data, isError, isLoading } = useRuns();
  const runs = data?.runs ?? [];
  const isSettled = !isLoading && !isError;

  return (
    <Section className="lg:sticky lg:top-8" rule={false} title="Recent">
      {isLoading ? (
        <p className="text-[13px] text-muted">Loading run history…</p>
      ) : null}

      {isError ? (
        <p className="text-[13px] text-muted">
          Could not load run history. The app&apos;s own store may be
          unavailable.
        </p>
      ) : null}

      {isSettled && runs.length === 0 ? (
        <p className="max-w-[36ch] text-[13px] leading-[1.6] text-muted">
          No runs yet. Pick a few models and preview a dry run — it costs
          nothing.
        </p>
      ) : null}

      {runs.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                className="flex flex-col gap-1.5 border-t border-border-soft py-3 no-underline transition-colors duration-150 hover:bg-surface-soft"
                href={`/runs/${run.id}`}
              >
                <span className="line-clamp-2 text-[13px] leading-[1.5] text-ink">
                  {run.prompt}
                </span>
                <span className="bench-numeric text-[11px] text-muted">
                  {run.models.length} model{run.models.length === 1 ? "" : "s"}{" "}
                  · {formatRelativeToNow(run.createdAt)}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <RunStatusBadge short status={run.status} />
                  {run.isMock ? <Badge>mock</Badge> : null}
                  {run.stale ? <Badge variant="bad">stale</Badge> : null}
                  <span className="bench-numeric ml-auto text-[11px] text-muted">
                    {formatUsd(run.costActualMicros ?? run.costEstimatedMicros)}
                    {run.costActualMicros === null ? " est" : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
};
