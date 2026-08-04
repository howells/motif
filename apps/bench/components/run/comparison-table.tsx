"use client";

import type { ModelAggregate } from "@motif/bench-core";

import { formatMs, formatPercent, formatUsd } from "@/lib/format";
import type { ModelQuality } from "@/lib/verdicts";

interface ComparisonTableProps {
  readonly quality: readonly ModelQuality[];
  readonly timing: readonly ModelAggregate[];
}

type Direction = "higher" | "lower";

interface Row {
  readonly direction: Direction;
  readonly label: string;
  readonly values: ReadonlyMap<string, number | null>;
}

const bestKeyFor = (row: Row): string | null => {
  let bestKey: string | null = null;
  let bestValue: number | null = null;
  for (const [key, value] of row.values) {
    if (value === null) {
      continue;
    }
    if (
      bestValue === null ||
      (row.direction === "lower" ? value < bestValue : value > bestValue)
    ) {
      bestValue = value;
      bestKey = key;
    }
  }
  return bestKey;
};

const formatRowValue = (row: Row, value: number | null): string => {
  if (value === null) {
    return "—";
  }
  if (row.label.startsWith("Provider") || row.label.startsWith("Total")) {
    return formatMs(value);
  }
  if (row.label === "Success rate") {
    return formatPercent(value);
  }
  if (row.label.startsWith("Mean cost")) {
    return formatUsd(Math.round(value));
  }
  return value.toFixed(2);
};

/** Metric rows × model columns, best-in-row highlighted
 * (`docs/arc/bench/BRIEF.md`, UI section) — the same per-model aggregates
 * the verdict strip picks its four superlatives from, laid out so every
 * model can be compared on every metric at once, not just the winner. */
export const ComparisonTable = ({ timing, quality }: ComparisonTableProps) => {
  const aliases = timing.map((model) => model.modelAlias);
  const qualityByAlias = new Map(
    quality.map((entry) => [entry.modelAlias, entry])
  );

  const rows: Row[] = [
    {
      direction: "lower",
      label: "Provider p50",
      values: new Map(timing.map((m) => [m.modelAlias, m.provider.p50Ms])),
    },
    {
      direction: "lower",
      label: "Provider p95",
      values: new Map(timing.map((m) => [m.modelAlias, m.provider.p95Ms])),
    },
    {
      direction: "lower",
      label: "Total p50",
      values: new Map(timing.map((m) => [m.modelAlias, m.total.p50Ms])),
    },
    {
      direction: "higher",
      label: "Success rate",
      values: new Map(
        timing.map((m) => [
          m.modelAlias,
          m.totalCount === 0 ? null : m.succeededCount / m.totalCount,
        ])
      ),
    },
    {
      direction: "lower",
      label: "Mean cost / image",
      values: new Map(
        timing.map((m) => [
          m.modelAlias,
          m.cost.totalKnownMicros === null || m.cost.knownCount === 0
            ? null
            : m.cost.totalKnownMicros / m.cost.knownCount,
        ])
      ),
    },
    {
      direction: "higher",
      label: "Quality (mean overall)",
      values: new Map(
        aliases.map((alias) => [
          alias,
          qualityByAlias.get(alias)?.meanOverall ?? null,
        ])
      ),
    },
  ];

  if (aliases.length === 0) {
    return <div className="empty-state">No samples to compare yet.</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Metric</th>
            {aliases.map((alias) => (
              <th key={alias}>{alias}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const bestKey = bestKeyFor(row);
            return (
              <tr key={row.label}>
                <td>{row.label}</td>
                {aliases.map((alias) => (
                  <td
                    className={`numeric${alias === bestKey ? " best-in-row" : ""}`}
                    key={alias}
                  >
                    {formatRowValue(row, row.values.get(alias) ?? null)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
