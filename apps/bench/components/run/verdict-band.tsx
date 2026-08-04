"use client";

import { formatMs, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VerdictPick, VerdictStripData } from "@/lib/verdicts";

interface Readout {
  readonly emptyLabel: string;
  readonly format: (pick: VerdictPick) => string;
  readonly label: string;
  readonly pick: VerdictPick | null;
  /** Rendered as a body-size suffix rather than baked into `format`, so the
   * 28px readout stays a bare number and still fits a 2-up mobile cell. */
  readonly unit?: string;
}

/** Four readouts separated by hairline rules — deliberately *not* four cards
 * (`docs/design/specs/design-bench.md`: "The verdict band is not four
 * cards"). The rules are per-cell left borders rather than a `gap` fill so
 * the band's leading edge stays flush with the text column at both the 4-up
 * and the 2×2 breakpoint, and so the 2×2 layout keeps its rules.
 *
 * The value is the one large thing on the page — mono, tabular, 28px — and
 * it is the only step in the type scale above body size. There is no display
 * type anywhere else. */
export const VerdictBand = ({ data }: { readonly data: VerdictStripData }) => {
  const readouts: Readout[] = [
    {
      emptyLabel: "no timings yet",
      format: (pick) => formatMs(Number(pick.value)),
      label: "Fastest",
      pick: data.fastest,
    },
    {
      emptyLabel: "not judged yet",
      format: (pick) => Number(pick.value).toFixed(2),
      label: "Best quality",
      pick: data.hasAnyJudgments ? data.bestQuality : null,
    },
    {
      emptyLabel: "no costs yet",
      format: (pick) => formatUsd(Math.round(Number(pick.value))),
      label: "Cheapest",
      pick: data.cheapest,
    },
    {
      emptyLabel: "not judged yet",
      format: (pick) => Number(pick.value).toFixed(0),
      label: "Best value",
      pick: data.hasAnyJudgments ? data.bestValue : null,
      unit: "pts/$",
    },
  ];

  return (
    <dl className="m-0 grid grid-cols-2 border-y border-border py-5 sm:grid-cols-4">
      {readouts.map((readout) => (
        <div
          className={cn(
            "flex min-w-0 flex-col gap-2 border-l border-border-soft px-5",
            // Leading cell of each row sits flush; at 4-up only the first does.
            "[&:nth-child(odd)]:border-l-0 [&:nth-child(odd)]:pl-0",
            "sm:[&:nth-child(odd)]:border-l sm:[&:nth-child(odd)]:pl-5",
            "sm:first:border-l-0 sm:first:pl-0",
            // The 2×2 layout keeps its rules: the second row gets a hairline
            // above it, so the band never degrades into four floating blocks.
            "max-sm:[&:nth-child(n+3)]:mt-4 max-sm:[&:nth-child(n+3)]:border-t max-sm:[&:nth-child(n+3)]:pt-4"
          )}
          key={readout.label}
        >
          <dt className="font-mono text-[11px] tracking-[0.08em] text-muted uppercase">
            {readout.label}
          </dt>
          <dd className="m-0 flex min-w-0 flex-col gap-1">
            {readout.pick ? (
              <>
                <span className="flex items-baseline gap-1.5">
                  <span className="bench-numeric text-[28px] leading-none font-medium text-ink">
                    {readout.format(readout.pick)}
                  </span>
                  {readout.unit === undefined ? null : (
                    <span className="bench-numeric text-muted">
                      {readout.unit}
                    </span>
                  )}
                </span>
                <span className="truncate font-mono text-muted">
                  {readout.pick.modelAlias}
                </span>
              </>
            ) : (
              <span className="text-muted">{readout.emptyLabel}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
};
