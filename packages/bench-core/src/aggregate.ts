/**
 * Nearest-rank percentile: sort ascending and select `ceil(p × n)`, one-based.
 * Empty inputs return `null`. Ported from materialdesk's
 * `packages/vision/src/benchmark/aggregate.ts` (`docs/arc/bench/BRIEF.md`
 * precedent table) — same semantics, same edge-case behavior for p50 of an
 * even-sized input.
 */
export const nearestRankPercentile = (
  values: readonly number[],
  percentile: number
): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(
    1,
    Math.min(sorted.length, Math.ceil(percentile * sorted.length))
  );
  return sorted[rank - 1] ?? null;
};

export interface PhaseTimingSummary {
  readonly count: number;
  readonly meanMs: number | null;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
}

const summarizePhase = (values: readonly number[]): PhaseTimingSummary => ({
  count: values.length,
  meanMs:
    values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length,
  p50Ms: nearestRankPercentile(values, 0.5),
  p95Ms: nearestRankPercentile(values, 0.95),
});

/** Cost total distinguishing "no known cost yet" (`null`) from a confirmed
 * $0 (`BRIEF.md` rule 9 — `null` cost must stay distinguishable from zero). */
export interface CostAggregate {
  readonly knownCount: number;
  readonly totalKnownMicros: number | null;
  readonly unknownCount: number;
}

export const aggregateCostMicros = (
  costsMicros: readonly (number | null)[]
): CostAggregate => {
  const known: number[] = [];
  let unknownCount = 0;
  for (const cost of costsMicros) {
    if (cost === null) {
      unknownCount++;
    } else {
      known.push(cost);
    }
  }
  return {
    knownCount: known.length,
    totalKnownMicros:
      known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0),
    unknownCount,
  };
};

/** Minimal shape `aggregateByModel` needs from a `bench_samples` row — kept
 * independent of `bench-db`'s Drizzle types so this module stays a pure
 * domain function with no schema dependency. */
export interface AggregateSampleInput {
  readonly costRefinedMicros: number | null;
  readonly downloadMs: number | null;
  readonly modelAlias: string;
  readonly providerMs: number | null;
  readonly status: "completed" | "failed" | "pending" | "running";
  readonly totalMs: number | null;
}

export interface ModelAggregate {
  readonly cost: CostAggregate;
  readonly download: PhaseTimingSummary;
  readonly failedCount: number;
  readonly modelAlias: string;
  readonly provider: PhaseTimingSummary;
  readonly succeededCount: number;
  readonly total: PhaseTimingSummary;
  readonly totalCount: number;
}

const numbers = (
  samples: readonly AggregateSampleInput[],
  key: "downloadMs" | "providerMs" | "totalMs"
): number[] =>
  samples.flatMap((sample) => {
    const value = sample[key];
    return value === null ? [] : [value];
  });

/**
 * Aggregate per-model p50/p95 timings and known cost, in stable
 * alphabetical model-alias order. Percentiles are computed over *completed*
 * samples only — a failed attempt has no meaningful latency to rank
 * (mirrors materialdesk's "measured" phase filter).
 */
export const aggregateByModel = (
  samples: readonly AggregateSampleInput[]
): ModelAggregate[] => {
  const aliases = [
    ...new Set(samples.map((sample) => sample.modelAlias)),
  ].sort();

  return aliases.map((modelAlias) => {
    const modelSamples = samples.filter(
      (sample) => sample.modelAlias === modelAlias
    );
    const completed = modelSamples.filter(
      (sample) => sample.status === "completed"
    );
    const failed = modelSamples.filter((sample) => sample.status === "failed");

    return {
      cost: aggregateCostMicros(
        modelSamples.map((sample) => sample.costRefinedMicros)
      ),
      download: summarizePhase(numbers(completed, "downloadMs")),
      failedCount: failed.length,
      modelAlias,
      provider: summarizePhase(numbers(completed, "providerMs")),
      succeededCount: completed.length,
      total: summarizePhase(numbers(completed, "totalMs")),
      totalCount: modelSamples.length,
    };
  });
};
