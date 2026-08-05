import { describe, expect, it } from "vitest";

import {
  aggregateByModel,
  aggregateCostMicros,
  nearestRankPercentile,
} from "./aggregate";
import type { AggregateSampleInput } from "./aggregate";

describe("nearestRankPercentile", () => {
  it("returns null for an empty input", () => {
    expect(nearestRankPercentile([], 0.5)).toBeNull();
    expect(nearestRankPercentile([], 0.95)).toBeNull();
  });

  it("returns the single value for a one-element input at any percentile", () => {
    expect(nearestRankPercentile([42], 0.5)).toBe(42);
    expect(nearestRankPercentile([42], 0.95)).toBe(42);
  });

  it("uses ceil(p × n), one-based rank — p50 of an even-sized input picks the lower middle", () => {
    // n=4: ceil(0.5*4)=2 -> sorted[1] (0-based) = second-smallest.
    expect(nearestRankPercentile([10, 20, 30, 40], 0.5)).toBe(20);
    // n=4: ceil(0.95*4)=4 -> sorted[3] = largest.
    expect(nearestRankPercentile([10, 20, 30, 40], 0.95)).toBe(40);
  });

  it("is order-independent (sorts internally)", () => {
    expect(nearestRankPercentile([40, 10, 30, 20], 0.5)).toBe(
      nearestRankPercentile([10, 20, 30, 40], 0.5)
    );
  });

  it("computes p95 with nearest-rank semantics for a 20-sample set", () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20
    // ceil(0.95*20)=19 -> sorted[18] = 19.
    expect(nearestRankPercentile(values, 0.95)).toBe(19);
  });
});

describe("aggregateCostMicros", () => {
  it("distinguishes no-known-cost (null) from a confirmed zero total", () => {
    expect(aggregateCostMicros([]).totalKnownMicros).toBeNull();
    expect(aggregateCostMicros([null, null]).totalKnownMicros).toBeNull();
    expect(aggregateCostMicros([0, 0]).totalKnownMicros).toBe(0);
  });

  it("sums only known costs and counts unknowns separately", () => {
    const result = aggregateCostMicros([1000, null, 2000, null]);
    expect(result.totalKnownMicros).toBe(3000);
    expect(result.knownCount).toBe(2);
    expect(result.unknownCount).toBe(2);
  });
});

const sample = (
  overrides: Partial<AggregateSampleInput>
): AggregateSampleInput => ({
  costRefinedMicros: null,
  downloadMs: null,
  modelAlias: "flux-fast",
  providerMs: null,
  status: "completed",
  totalMs: null,
  ...overrides,
});

describe("aggregateByModel", () => {
  it("groups by model alias in alphabetical order", () => {
    const result = aggregateByModel([
      sample({ modelAlias: "recraft" }),
      sample({ modelAlias: "banana" }),
      sample({ modelAlias: "gpt2" }),
    ]);
    expect(result.map((r) => r.modelAlias)).toEqual([
      "banana",
      "gpt2",
      "recraft",
    ]);
  });

  it("computes p50/p95 per phase over completed samples only", () => {
    const result = aggregateByModel([
      sample({ providerMs: 100, status: "completed" }),
      sample({ providerMs: 200, status: "completed" }),
      sample({ providerMs: 9999, status: "failed" }), // excluded from percentiles
    ]);
    const [flux] = result;
    expect(flux?.provider.count).toBe(2);
    expect(flux?.provider.p50Ms).toBe(100);
    expect(flux?.succeededCount).toBe(2);
    expect(flux?.failedCount).toBe(1);
    expect(flux?.totalCount).toBe(3);
  });

  it("carries cost aggregation with null/zero distinction per model", () => {
    const result = aggregateByModel([
      sample({ costRefinedMicros: null }),
      sample({ costRefinedMicros: null }),
    ]);
    expect(result[0]?.cost.totalKnownMicros).toBeNull();
    expect(result[0]?.cost.unknownCount).toBe(2);
  });

  it("returns an empty array for no samples", () => {
    expect(aggregateByModel([])).toEqual([]);
  });
});
