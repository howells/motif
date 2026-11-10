import { describe, expect, it } from "vitest";

import { estimateCost } from "../src/cost";
import { GENERATION_MODELS, MODELS } from "../src/models";
import { projectedToolCost } from "../src/tool-cost";

function price(model: string): number {
  const value = MODELS[model]?.pricePerImageUsd;
  if (value === undefined) {
    throw new Error(`missing configured price for ${model}`);
  }
  return value;
}

describe("estimateCost", () => {
  it("charges banana2 at fal's published resolution tiers", () => {
    const base = price("banana2");
    expect(estimateCost("banana2", "0.5K")).toBeCloseTo(base * 0.75);
    expect(estimateCost("banana2", "1K")).toBeCloseTo(base);
    expect(estimateCost("banana2", "2K")).toBeCloseTo(base * 1.5);
    expect(estimateCost("banana2", "4K")).toBeCloseTo(base * 2);
  });

  it("doubles banana at 4K only", () => {
    const base = price("banana");
    expect(estimateCost("banana", "1K")).toBeCloseTo(base);
    expect(estimateCost("banana", "2K")).toBeCloseTo(base);
    expect(estimateCost("banana", "4K")).toBeCloseTo(base * 2);
  });

  it("multiplies by image count", () => {
    expect(estimateCost("banana2", "4K", 3)).toBeCloseTo(
      price("banana2") * 2 * 3
    );
  });

  it("ignores resolution for models without tiered pricing", () => {
    expect(estimateCost("flux2-pro", "4K")).toBeCloseTo(price("flux2-pro"));
  });
});

describe("estimateCost refusals", () => {
  it("refuses an id that is not a registry Model", () => {
    expect(() => estimateCost("nope")).toThrow("Unknown Model: nope");
  });

  it("prices every generation Model or marks it token-metered", () => {
    for (const id of GENERATION_MODELS) {
      expect(() => estimateCost(id)).not.toThrow();
    }
  });
});

describe("output-second price", () => {
  const kling = { audioUsd: 0.168, kind: "output-second", usd: 0.112 } as const;

  it("charges the audio rate unless generate_audio is false", () => {
    expect(projectedToolCost(kling, { duration: "5" }).usd).toBeCloseTo(0.84);
    expect(
      projectedToolCost(kling, { duration: "5", generate_audio: false }).usd
    ).toBeCloseTo(0.56);
  });

  it("charges the one rate of a Model with no audio switch", () => {
    expect(
      projectedToolCost({ kind: "output-second", usd: 0.14 }, { duration: "5" })
        .usd
    ).toBeCloseTo(0.7);
  });

  it("is unknown without a numeric duration", () => {
    expect(projectedToolCost(kling, { duration: "soon" })).toStrictEqual({
      basis: "unknown",
      usd: null,
    });
  });
});
