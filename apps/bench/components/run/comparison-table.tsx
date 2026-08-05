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
import { cn } from "@/lib/utils";
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

/** `null` means different things per row and the label has to say which.
 * "not rated" is only true of the quality row; a model whose every attempt
 * failed has no latency and no cost to report, and calling that "not rated"
 * blames the rater for a generation failure. */
const formatRowValue = (row: Row, value: number | null): string => {
  if (value === null) {
    return row.label.startsWith("Quality") ? "not rated" : "no data";
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
      label: "Quality (mean ★)",
      values: new Map(
        aliases.map((alias) => [
          alias,
          qualityByAlias.get(alias)?.meanStars ?? null,
        ])
      ),
    },
  ];

  if (aliases.length === 0) {
    return <p className="text-[13px] text-muted">Nothing to compare yet.</p>;
  }

  return (
    // Fixed column widths, not full-bleed. Stretching the table to the
    // content column puts ~500px between a metric's label and its value,
    // which defeats the comparison the table exists for. 200px for the label,
    // 160px per model, packed from the left; past about six models the table
    // outgrows its container and the container scrolls.
    <Table className="w-auto max-w-full">
      <TableHeader>
        <TableRow>
          {/* `min-w` as well as `w`: auto table layout treats `width` as a
              hint and will happily crush columns to fit the container, which
              is how a fourteen-model run ended up wrapping "Provider p50"
              onto two lines instead of scrolling. */}
          <TableHead className="w-[200px] min-w-[200px]">Metric</TableHead>
          {aliases.map((alias) => (
            <TableHead
              className="w-[160px] min-w-[160px] text-right"
              key={alias}
            >
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
              <TableCell className="text-[13px] whitespace-nowrap text-muted">
                {row.label}
              </TableCell>
              {aliases.map((alias) => {
                const value = row.values.get(alias) ?? null;
                return (
                  <TableCell
                    // Mono only when the cell holds a figure. `not rated` and
                    // `no data` are sentences standing in for one, and setting
                    // them in tabular figures makes an absence look like a
                    // measurement.
                    className={cn(
                      "text-right text-[13px] whitespace-nowrap",
                      value === null ? "text-muted" : "bench-numeric text-ink"
                    )}
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
