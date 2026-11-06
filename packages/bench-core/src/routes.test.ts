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
    const budgeted = new Set(BENCH_ROUTES.map((route) => route.alias));
    for (const alias of GENERATION_MODELS) {
      if (!budgeted.has(alias)) {
        expect(() => routeFor(alias)).toThrow(MissingPricingError);
      }
    }
  });

  it("derives cost_basis from falPricing.unit, not a hardcoded alias list", () => {
    for (const route of BENCH_ROUTES) {
      const config = MODELS[route.alias];
      expect(route.costBasis).toBe(config?.falPricing?.unit);
    }
  });

  it("carries observedAt/sourceUrl provenance derived from falPricing, never invented", () => {
    for (const route of BENCH_ROUTES) {
      const config = MODELS[route.alias];
      expect(route.pricing.observedAt).toBe(config?.falPricing?.checkedAt);
      expect(route.pricing.sourceUrl).toContain(config?.falPricing?.endpointId);
      expect(route.pricing.estimatedCostUsd).toBeGreaterThan(0);
    }
  });

  it("routeFor and the by-alias map agree with the array", () => {
    for (const route of BENCH_ROUTES) {
      expect(routeFor(route.alias)).toStrictEqual(route);
      expect(BENCH_ROUTES_BY_ALIAS.get(route.alias)).toStrictEqual(route);
    }
  });
});
