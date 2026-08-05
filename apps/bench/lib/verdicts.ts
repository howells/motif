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

import type {
  JudgmentRecord,
  ManualRatingRecord,
  SampleRecord,
} from "@/lib/runs/types";

/** Mean quality for one model, on the 1–5 star scale. */
export interface ModelQuality {
  readonly meanStars: number | null;
  readonly modelAlias: string;
  readonly ratedCount: number;
}

/** Quality is human judgment (2026-08-05): the auto-judge is out of the
 * product path, so every quality reading in the app — the verdict strip, the
 * comparison table's quality row, and the cost/quality scatter — is the mean
 * of *manual star ratings*. Reading judgments here instead would leave both
 * the table row and the whole scatter permanently empty, since nothing in the
 * UI can produce a judgment any more. Historical judgments still render on
 * their own sample frames; they just do not aggregate. */
export const aggregateQualityByModel = (
  samples: readonly SampleRecord[],
  manualRatings: readonly ManualRatingRecord[]
): ModelQuality[] => {
  const starsBySample = new Map(
    manualRatings.map((rating) => [rating.sampleId, rating.stars])
  );
  const aliases = [
    ...new Set(samples.map((sample) => sample.modelAlias)),
  ].toSorted();

  return aliases.map((modelAlias) => {
    const stars = samples
      .filter((sample) => sample.modelAlias === modelAlias)
      .map((sample) => starsBySample.get(sample.id))
      .filter((value) => typeof value === "number");

    return {
      meanStars:
        stars.length === 0
          ? null
          : stars.reduce((sum, value) => sum + value, 0) / stars.length,
      modelAlias,
      ratedCount: stars.length,
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
  judgments: readonly JudgmentRecord[],
  manualRatings: readonly ManualRatingRecord[] = []
): VerdictStripData => {
  // Quality is human judgment (2026-08-05): the auto-judge is out of the
  // product path, so "Best quality" and "Best value" read the manual star
  // ratings — mean stars per model, stars-per-dollar for value. Historical
  // judgments still render on sample cards but no longer drive verdicts.
  const starsByAlias = new Map<string, { count: number; sum: number }>();
  const aliasBySample = new Map(
    samples.map((sample) => [sample.id, sample.modelAlias])
  );
  for (const rating of manualRatings) {
    const alias = aliasBySample.get(rating.sampleId);
    if (alias === undefined) {
      continue;
    }
    const entry = starsByAlias.get(alias) ?? { count: 0, sum: 0 };
    entry.count += 1;
    entry.sum += rating.stars;
    starsByAlias.set(alias, entry);
  }
  const timing = aggregateByModel(samples.map(toAggregateInput));

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
    [...starsByAlias.entries()].map(([modelAlias, entry]) => ({
      modelAlias,
      sublabel: `mean of ${entry.count} star rating${countSuffix(entry.count)}`,
      value: entry.sum / entry.count,
    })),
    "higher"
  );

  const bestValue = bestCandidate(
    timing.flatMap((model) => {
      const usd = perImageUsd(model);
      const stars = starsByAlias.get(model.modelAlias);
      return usd === null || usd <= 0 || stars === undefined
        ? []
        : [
            {
              modelAlias: model.modelAlias,
              sublabel: "stars per dollar",
              value: stars.sum / stars.count / usd,
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
