import { describe, expect, it } from "vitest";

import {
  BENCH_ROUTES,
  BENCH_ROUTES_BY_ALIAS,
  MissingPricingError,
  routeFor,
} from "./routes";
import { GENERATION_MODELS, MODELS } from "./sdk-internal";

describe("routes", () => {
  it("excludes metered models from budgeted routes and rejects explicit selection", () => {
    expect(BENCH_ROUTES.map((route) => route.alias)).toStrictEqual(
      GENERATION_MODELS.filter(
        (alias) =>
          MODELS[alias]?.pricePerImageUsd !== null &&
          MODELS[alias]?.falPricing !== undefined
      )
    );
    expect(() => routeFor("flare")).toThrow(MissingPricingError);
    expect(() => routeFor("sunburst")).toThrow(MissingPricingError);
    expect(() => routeFor("banana2-lite")).toThrow(MissingPricingError);
    expect(() => routeFor("banana21")).toThrow(MissingPricingError);
    expect(() => routeFor("mai-image-2.5")).toThrow(MissingPricingError);
    expect(() => routeFor("flux-fast")).toThrow(MissingPricingError);
  });

  it("derives cost_basis from falPricing.unit, not a hardcoded alias list", () => {
    for (const route of BENCH_ROUTES) {
      const config = MODELS[route.alias];
      expect(route.costBasis).toBe(config?.falPricing?.unit);
    }
    // The curated routes retain distinct billing units, not a single constant.
    const distinctBases = new Set(BENCH_ROUTES.map((route) => route.costBasis));
    expect(distinctBases.size).toBe(4);
    expect([...distinctBases].sort()).toStrictEqual(
      ["images", "megapixels", "processed megapixels", "units"].sort()
    );
  });

  it("the budgeted curated sweep estimates $1.1795 for one sample per Model", () => {
    const totalUsd = BENCH_ROUTES.reduce(
      (sum, route) => sum + route.pricing.estimatedCostUsd,
      0
    );
    expect(totalUsd).toBeCloseTo(1.1795, 4);
  });

  it("carries observedAt/sourceUrl provenance derived from falPricing, never invented", () => {
    for (const route of BENCH_ROUTES) {
      const config = MODELS[route.alias];
      expect(route.pricing.observedAt).toBe(config?.falPricing?.checkedAt);
      expect(route.pricing.sourceUrl).toContain(config?.falPricing?.endpointId);
      expect(route.pricing.estimatedCostUsd).toBeGreaterThan(0);
    }
  });

  it("flags ten curated budgeted Models with no measured p95 latency", () => {
    const missing = BENCH_ROUTES.filter(
      (route) => route.speedP95Seconds === null
    );
    expect(missing).toHaveLength(10);
  });

  it("flags gpt2 as the only queue-polled model", () => {
    const queued = BENCH_ROUTES.filter((route) => route.usesQueue);
    expect(queued.map((route) => route.alias)).toStrictEqual(["gpt2"]);
  });

  it("routeFor and the by-alias map agree with the array", () => {
    for (const route of BENCH_ROUTES) {
      expect(routeFor(route.alias)).toStrictEqual(route);
      expect(BENCH_ROUTES_BY_ALIAS.get(route.alias)).toStrictEqual(route);
    }
  });
});
