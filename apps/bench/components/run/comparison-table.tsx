"use client";

import type { ModelAggregate } from "@motif/bench-core";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    return "not judged";
  }
  if (row.label.startsWith("Provider") || row.label.startsWith("Total")) {
    return formatMs(value);
  }
  if (row.label === "Success rate") {
    return formatPercent(value);
  }
  if (row.label.startsWith("Cost")) {
    return formatUsd(Math.round(value));
  }
  return value.toFixed(2);
};

/** Metric rows × model columns, best-in-row marked
 * (`docs/arc/bench/BRIEF.md`, UI section) — the same per-model aggregates
 * the verdict band picks its four superlatives from, laid out so every model
 * can be compared on every metric at once, not just the winner.
 *
 * "Best" is a single accent glyph beside the value, not a tinted cell
 * (`docs/design/specs/design-bench.md`): a filled cell is a second, louder
 * emphasis competing with the numbers themselves, and it would blow the
 * two-accent-fills budget six times over on a six-row table. */
export const ComparisonTable = ({ quality, timing }: ComparisonTableProps) => {
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
      label: "Cost / image",
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
      label: "Quality (mean)",
      values: new Map(
        aliases.map((alias) => [
          alias,
          qualityByAlias.get(alias)?.meanOverall ?? null,
        ])
      ),
    },
  ];

  if (aliases.length === 0) {
    return <p className="text-[13px] text-muted">Nothing to compare yet.</p>;
  }

  return (
    // Full width, not shrink-to-fit: the row rules are the same hairlines the
    // verdict band and every section header use, so a table huddled at 480px
    // on a 1120px column reads as an accident. The metric column is pinned so
    // the numbers stay in even, comparable tracks whatever the model count.
    <Table className="w-full min-w-max">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[220px] pr-8">Metric</TableHead>
          {aliases.map((alias) => (
            <TableHead className="min-w-[112px] text-right" key={alias}>
              {alias}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const bestKey = bestKeyFor(row);
          return (
            <TableRow key={row.label}>
              <TableCell className="text-[13px] text-muted">
                {row.label}
              </TableCell>
              {aliases.map((alias) => {
                const value = row.values.get(alias) ?? null;
                return (
                  <TableCell
                    className="bench-numeric text-right text-[13px] text-ink"
                    key={alias}
                  >
                    {formatRowValue(row, value)}
                    {alias === bestKey ? (
                      <span aria-hidden className="ml-1.5 text-accent">
                        ◂
                      </span>
                    ) : null}
                    {alias === bestKey ? (
                      <span className="sr-only"> — best in row</span>
                    ) : null}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
