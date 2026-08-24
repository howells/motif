// A MODEL OBJECT GETS EXACTLY ONE SOURCE OF PRICE TRUTH, AND IT IS FAL'S.
//
// Every `benchmark.artificialAnalysis` metric used to carry a per-1k-image price beside `elo`
// and `rank`. That figure was the vendor's own API price, not fal's, and nothing in the type or
// the comments said so - it just sat there next to `falPricing`. Reve reads $200/1k direct and
// $40/1k through fal. Anything reading a model to decide cost could pick up the wrong one and
// pass over a model that costs 4p (MOT-40).
//
// THIS TEST IS STRUCTURAL, NOT NUMERIC, AND THAT IS DELIBERATE. Do not "improve" it into a
// tolerance check between the leaderboard's `apiPricing` and `falPricing`. Those are two vendors
// in two markets with two margins; a reseller being cheaper is not a discrepancy, and asserting
// they roughly agree asserts something false. Neither number was ever wrong. What was wrong was
// where one of them lived. So the invariant is about placement: a price that is not fal's does
// not belong inside a model object at all.
//
// `apiPricing` in `leaderboards.ts` is fine where it is - it is a property of a leaderboard
// entry, plainly the board's own, and a consumer reading it knows whose price it is.
//
// Both sides are already in the repo, so this needs no network and runs in the normal suite.

import { describe, expect, it } from "vitest";

import { MODELS } from "../src/models";

/** Key names that read as a price or a cost, whoever's it turns out to be. */
const PRICE_SHAPED_KEY = /pric|cost|usd/i;

// `benchmark.tiers.price` is a categorical band - "budget", "ultra" - not a figure, so it names a
// price without being one. It is the single exemption. The assertion below pins it to a string so
// the exemption cannot quietly become the hiding place for the next stray number.
const EXEMPT_PATHS = new Set(["tiers.price"]);

/** Every price-shaped key under `benchmark`, as dotted paths, minus the exemptions. */
function findPriceShapedPaths(node: unknown, trail: string[] = []): string[] {
  if (typeof node !== "object" || node === null) {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((item) => findPriceShapedPaths(item, trail));
  }
  return Object.entries(node).flatMap(([key, value]) => {
    const path = [...trail, key].join(".");
    const nested = findPriceShapedPaths(value, [...trail, key]);
    return PRICE_SHAPED_KEY.test(key) && !EXEMPT_PATHS.has(path)
      ? [path, ...nested]
      : nested;
  });
}

describe("model benchmark blocks hold no price", () => {
  it("carries no price-shaped field anywhere under benchmark", () => {
    const offenders = Object.entries(MODELS).flatMap(([id, config]) =>
      findPriceShapedPaths(config.benchmark).map(
        (path) =>
          `${id}: benchmark.${path} is a price-shaped field inside a model's benchmark block. ` +
          `A model carries one price and it is fal's - put the figure in falPricing if it is ` +
          `what fal bills us, or on the leaderboard entry in leaderboards.ts if it is a vendor's own.`
      )
    );
    expect(offenders).toEqual([]);
  });

  it("keeps benchmark.tiers.price a categorical tier, never a figure", () => {
    const numeric = Object.entries(MODELS).flatMap(([id, config]) => {
      const tier: unknown = config.benchmark?.tiers?.price;
      return tier === undefined || typeof tier === "string"
        ? []
        : [
            `${id}: benchmark.tiers.price is ${typeof tier} ${JSON.stringify(tier)}. ` +
              `It is exempt from the price-field check only because it is a band like "budget", ` +
              `not a number. A figure here is the MOT-40 defect coming back through the exemption.`,
          ];
    });
    expect(numeric).toEqual([]);
  });
});
