/**
 * Verdict-strip maths for the run page: Fastest, Best quality, Cheapest,
 * Best value (`docs/arc/bench/BRIEF.md`, UI section). Per-model timing and
 * cost aggregation reuses `@motif/bench-core`'s `aggregateByModel` directly
 * — this module only adds the quality dimension (from judgments, which
 * `bench-core` has no opinion on aggregating) and the four superlative
 * picks. Each pick is `null` when there is nothing to compare yet — a real
 * empty state, not a placeholder zero.
 */
import { aggregateByModel } from "@motif/bench-core";
import type { AggregateSampleInput, ModelAggregate } from "@motif/bench-core";

import type { JudgmentRecord, SampleRecord } from "@/lib/runs/types";

export interface ModelQuality {
  readonly meanOverall: number | null;
  readonly modelAlias: string;
  readonly scoredCount: number;
}

export const aggregateQualityByModel = (
  samples: readonly SampleRecord[],
  judgments: readonly JudgmentRecord[]
): ModelQuality[] => {
  const judgmentBySample = new Map(
    judgments.map((judgment) => [judgment.sampleId, judgment])
  );
  const aliases = [
    ...new Set(samples.map((sample) => sample.modelAlias)),
  ].toSorted();

  return aliases.map((modelAlias) => {
    const scores = samples
      .filter((sample) => sample.modelAlias === modelAlias)
      .map((sample) => judgmentBySample.get(sample.id))
      .filter((judgment) => judgment?.status === "scored")
      .map((judgment) => judgment?.overall)
      .filter((overall) => typeof overall === "number");

    return {
      meanOverall:
        scores.length === 0
          ? null
          : scores.reduce((sum, value) => sum + value, 0) / scores.length,
      modelAlias,
      scoredCount: scores.length,
    };
  });
};

export interface VerdictPick {
  readonly modelAlias: string;
  readonly sublabel: string;
  readonly value: string;
}

export interface VerdictStripData {
  readonly bestQuality: VerdictPick | null;
  readonly bestValue: VerdictPick | null;
  readonly cheapest: VerdictPick | null;
  readonly fastest: VerdictPick | null;
  readonly hasAnyJudgments: boolean;
  readonly timing: readonly ModelAggregate[];
}

const toAggregateInput = (sample: SampleRecord): AggregateSampleInput => ({
  costRefinedMicros: sample.costRefinedMicros,
  downloadMs: sample.downloadMs ?? null,
  modelAlias: sample.modelAlias,
  providerMs: sample.providerMs,
  status: sample.status,
  totalMs: sample.totalMs,
});

interface Candidate {
  readonly modelAlias: string;
  readonly sublabel: string;
  readonly value: number;
}

/** Reduces a list of already-`null`-filtered candidates to the single best
 * one — `direction: "lower"` for latency/cost, `"higher"` for quality/value.
 * Each of the four verdict picks below builds its candidate list with a
 * `.flatMap` (skip a model by returning `[]`, keep it by returning one
 * entry) instead of a `for` loop with a `continue`, so there is exactly one
 * loop-free code path per pick rather than a branchy imperative one. */
const bestCandidate = (
  candidates: readonly Candidate[],
  direction: "higher" | "lower"
): VerdictPick | null => {
  const [first, ...rest] = candidates;
  if (!first) {
    return null;
  }
  let winner = first;
  for (const candidate of rest) {
    const candidateIsBetter =
      direction === "lower"
        ? candidate.value < winner.value
        : candidate.value > winner.value;
    if (candidateIsBetter) {
      winner = candidate;
    }
  }
  return {
    modelAlias: winner.modelAlias,
    sublabel: winner.sublabel,
    value: String(winner.value),
  };
};

const perImageUsd = (model: ModelAggregate): number | null =>
  model.cost.totalKnownMicros === null || model.cost.knownCount === 0
    ? null
    : model.cost.totalKnownMicros / model.cost.knownCount / 1_000_000;

const countSuffix = (count: number): string => (count === 1 ? "" : "s");

export const buildVerdictStrip = (
  samples: readonly SampleRecord[],
  judgments: readonly JudgmentRecord[]
): VerdictStripData => {
  const timing = aggregateByModel(samples.map(toAggregateInput));
  const quality = aggregateQualityByModel(samples, judgments);
  const qualityByAlias = new Map(
    quality.map((entry) => [entry.modelAlias, entry])
  );

  const fastest = bestCandidate(
    timing.flatMap((model) =>
      model.provider.p50Ms === null
        ? []
        : [
            {
              modelAlias: model.modelAlias,
              sublabel: `p50 provider latency, n=${model.provider.count}`,
              value: model.provider.p50Ms,
            },
          ]
    ),
    "lower"
  );

  const cheapest = bestCandidate(
    timing.flatMap((model) => {
      const usd = perImageUsd(model);
      return usd === null
        ? []
        : [
            {
              modelAlias: model.modelAlias,
              sublabel: `mean of ${model.cost.knownCount} known-cost sample${countSuffix(model.cost.knownCount)}`,
              value: usd * 1_000_000,
            },
          ];
    }),
    "lower"
  );

  const bestQuality = bestCandidate(
    quality.flatMap((model) =>
      model.meanOverall === null
        ? []
        : [
            {
              modelAlias: model.modelAlias,
              sublabel: `mean of ${model.scoredCount} judged sample${countSuffix(model.scoredCount)}`,
              value: model.meanOverall,
            },
          ]
    ),
    "higher"
  );

  const bestValue = bestCandidate(
    timing.flatMap((model) => {
      const usd = perImageUsd(model);
      const meanOverall =
        qualityByAlias.get(model.modelAlias)?.meanOverall ?? null;
      return usd === null || usd <= 0 || meanOverall === null
        ? []
        : [
            {
              modelAlias: model.modelAlias,
              sublabel: "quality points per dollar",
              value: meanOverall / usd,
            },
          ];
    }),
    "higher"
  );

  return {
    bestQuality,
    bestValue,
    cheapest,
    fastest,
    hasAnyJudgments: judgments.some((judgment) => judgment.status === "scored"),
    timing,
  };
};
