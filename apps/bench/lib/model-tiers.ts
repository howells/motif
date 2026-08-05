/**
 * Groups the 23 `BENCH_ROUTES` models into price tiers for the composer's
 * model-chip picker (`docs/arc/bench/BRIEF.md`: "model chips for all 23
 * models, grouped by price tier"). Tier boundaries are fixed USD thresholds
 * documented here, not quantiles of the current catalog — quantiles would
 * silently reshuffle every model's tier the next time a model's price
 * changes or a new model is added, which is exactly the kind of drift a
 * benchmarking tool should not have in its own UI.
 */
import { BENCH_ROUTES } from "@motif/bench-core";
import type { BenchRoute } from "@motif/bench-core";

export const PRICE_TIERS = [
  { label: "Budget (< $0.03/image)", maxUsd: 0.03 },
  { label: "Standard ($0.03–$0.08/image)", maxUsd: 0.08 },
  { label: "Premium (> $0.08/image)", maxUsd: Infinity },
] as const;

export interface ModelTierGroup {
  readonly label: string;
  readonly routes: readonly BenchRoute[];
}

export const modelTierGroups = (): ModelTierGroup[] => {
  const sorted = [...BENCH_ROUTES].sort(
    (left, right) =>
      left.pricing.estimatedCostUsd - right.pricing.estimatedCostUsd
  );

  return PRICE_TIERS.map((tier, index) => {
    const previousMax = index === 0 ? 0 : (PRICE_TIERS[index - 1]?.maxUsd ?? 0);
    return {
      label: tier.label,
      routes: sorted.filter(
        (route) =>
          route.pricing.estimatedCostUsd >= previousMax &&
          route.pricing.estimatedCostUsd < tier.maxUsd
      ),
    };
  });
};
