import { GENERATION_MODELS, MODELS } from "@howells/motif-sdk";
import { describe, expect, it } from "vitest";

import { BENCH_ROUTES, BENCH_ROUTES_BY_ALIAS, routeFor } from "./routes";

describe("routes", () => {
  it("derives exactly one route per GENERATION_MODELS alias, in order", () => {
    expect(BENCH_ROUTES).toHaveLength(GENERATION_MODELS.length);
    expect(BENCH_ROUTES.map((route) => route.alias)).toEqual([
      ...GENERATION_MODELS,
    ]);
  });

  it("derives cost_basis from falPricing.unit, not a hardcoded alias list", () => {
    for (const route of BENCH_ROUTES) {
      const config = MODELS[route.alias];
      expect(route.costBasis).toBe(config?.falPricing?.unit);
    }
    // falPricing.unit has five possible values across the 23 models (BRIEF.md
    // verified ground truth) — assert the routes surface real variety, not a
    // single constant.
    const distinctBases = new Set(BENCH_ROUTES.map((route) => route.costBasis));
    expect(distinctBases.size).toBe(5);
    expect([...distinctBases].sort()).toEqual(
      [
        "compute seconds",
        "images",
        "megapixels",
        "processed megapixels",
        "units",
      ].sort()
    );
  });

  it("full sweep of 24 models × 1 sample costs ≈ $1.369 (verified sum)", () => {
    const totalUsd = BENCH_ROUTES.reduce(
      (sum, route) => sum + route.pricing.estimatedCostUsd,
      0
    );
    expect(totalUsd).toBeCloseTo(1.369, 3);
  });

  it("carries observedAt/sourceUrl provenance derived from falPricing, never invented", () => {
    for (const route of BENCH_ROUTES) {
      const config = MODELS[route.alias];
      expect(route.pricing.observedAt).toBe(config?.falPricing?.checkedAt);
      expect(route.pricing.sourceUrl).toContain(config?.falPricing?.endpointId);
      expect(route.pricing.estimatedCostUsd).toBeGreaterThan(0);
    }
  });

  it("flags 13 of 24 models with no benchmark.speed.p95Seconds — the timeout floor is the common path", () => {
    const missing = BENCH_ROUTES.filter(
      (route) => route.speedP95Seconds === null
    );
    expect(missing).toHaveLength(13);
  });

  it("flags gpt2 as the only queue-polled model", () => {
    const queued = BENCH_ROUTES.filter((route) => route.usesQueue);
    expect(queued.map((route) => route.alias)).toEqual(["gpt2"]);
  });

  it("routeFor and the by-alias map agree with the array", () => {
    for (const route of BENCH_ROUTES) {
      expect(routeFor(route.alias)).toEqual(route);
      expect(BENCH_ROUTES_BY_ALIAS.get(route.alias)).toEqual(route);
    }
  });
});
