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
import { formatPercent, formatSeconds, formatUsd } from "@/lib/format";
import { modelNameOf } from "@/lib/model-names";
import { cn } from "@/lib/utils";
import type { ModelQuality } from "@/lib/verdicts";

interface ComparisonTableProps {
  readonly quality: readonly ModelQuality[];
  readonly samplesPerModel: number;
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

/** `null` means different things per row and the label has to say which. A
 * model whose every attempt failed has no time and no cost to report, and
 * calling that "not rated" would blame the rater for a failed generation. */
const formatRowValue = (row: Row, value: number | null): string => {
  if (value === null) {
    return row.label === "Mean rating" ? "Not rated" : "No data";
  }
  if (row.label.startsWith("Provider") || row.label.startsWith("Total")) {
    return formatSeconds(value);
  }
  if (row.label === "Success rate") {
    return formatPercent(value);
  }
  if (row.label.startsWith("Cost")) {
    return formatUsd(Math.round(value));
  }
  return value.toFixed(2);
};

/** Metric rows by Model columns, with the best in each row set in green. The
 * same per-model aggregates the summary strip picks its four leaders from,
 * laid out so every Model can be compared on every metric at once. */
export const ComparisonTable = ({
  quality,
  samplesPerModel,
  timing,
}: ComparisonTableProps) => {
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
      label: "Cost per image",
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
      label: "Mean rating",
      values: new Map(
        aliases.map((alias) => [
          alias,
          qualityByAlias.get(alias)?.meanStars ?? null,
        ])
      ),
    },
  ];

  if (aliases.length === 0) {
    return <p className="text-muted type-small">No data</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The label column holds its width and each Model gets room for its
          name, so a long name never wraps. Past about six Models the table is
          wider than the pane and the page scrolls it sideways. */}
      <div className="overflow-x-auto">
        <Table className="min-w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px] min-w-[200px]">Metric</TableHead>
              {aliases.map((alias) => (
                <TableHead
                  className="text-ink min-w-[160px] text-right font-medium"
                  key={alias}
                >
                  {modelNameOf(alias)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const bestKey = bestKeyFor(row);
              return (
                <TableRow key={row.label}>
                  <TableCell className="text-muted type-small whitespace-nowrap">
                    {row.label}
                  </TableCell>
                  {aliases.map((alias) => {
                    const value = row.values.get(alias) ?? null;
                    const best = alias === bestKey;
                    return (
                      <TableCell
                        className={cn(
                          "type-small text-right whitespace-nowrap tabular-nums",
                          value === null ? "text-muted" : "text-ink",
                          best ? "text-ok" : ""
                        )}
                        key={alias}
                      >
                        {formatRowValue(row, value)}
                        {best ? (
                          <span className="sr-only"> best in row</span>
                        ) : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="type-small flex items-center justify-between gap-4">
        <span className="text-ok">Best in row</span>
        <span className="text-muted">
          {samplesPerModel} sample{samplesPerModel === 1 ? "" : "s"} per model ·
          estimated costs
        </span>
      </div>
    </div>
  );
};
