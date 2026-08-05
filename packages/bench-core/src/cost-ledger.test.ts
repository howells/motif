import type { GenerationModelName } from "@howells/motif-sdk";
import { describe, expect, it } from "vitest";

import {
  assertWithinCostCap,
  CostCapExceededError,
  CostLedger,
  estimateWorstCaseMicros,
  MissingPricingError,
  usdToMicros,
} from "./cost-ledger";

describe("usdToMicros", () => {
  it("converts USD to integer micros", () => {
    expect(usdToMicros(1)).toBe(1_000_000);
    expect(usdToMicros(0.003)).toBe(3000);
    expect(Number.isInteger(usdToMicros(0.211))).toBe(true);
  });
});

describe("estimateWorstCaseMicros", () => {
  it("sums per-model cost × samplesPerModel in integer micros", () => {
    // flux-fast ($0.003) + grok-image ($0.02) — BRIEF.md's cheapest smoke pair.
    const totalMicros = estimateWorstCaseMicros({
      models: ["flux-fast", "grok-image"],
      samplesPerModel: 1,
    });
    expect(totalMicros).toBe(usdToMicros(0.003) + usdToMicros(0.02));
    expect(Number.isInteger(totalMicros)).toBe(true);
  });

  it("scales linearly with samplesPerModel", () => {
    const one = estimateWorstCaseMicros({
      models: ["flux-fast"],
      samplesPerModel: 1,
    });
    const three = estimateWorstCaseMicros({
      models: ["flux-fast"],
      samplesPerModel: 3,
    });
    expect(three).toBe(one * 3);
  });

  it("throws MissingPricingError instead of silently treating an unpriced model as free", () => {
    expect(() =>
      estimateWorstCaseMicros({
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- deliberately an invalid alias to exercise the guard
        models: ["not-a-real-model" as GenerationModelName],
        samplesPerModel: 1,
      })
    ).toThrow(MissingPricingError);
  });
});

describe("assertWithinCostCap", () => {
  it("returns the worst-case total when under the cap", () => {
    const worstCaseMicros = assertWithinCostCap(
      { models: ["flux-fast"], samplesPerModel: 1 },
      1
    );
    expect(worstCaseMicros).toBe(usdToMicros(0.003));
  });

  it("throws CostCapExceededError before any provider work when over the cap", () => {
    expect(() =>
      assertWithinCostCap({ models: ["gpt2"], samplesPerModel: 1 }, 0.01)
    ).toThrow(CostCapExceededError);
  });
});

describe("CostLedger", () => {
  it("reserves within the cap and reports the committed total", () => {
    const ledger = new CostLedger(1);
    ledger.reserve("a", usdToMicros(0.3));
    ledger.reserve("b", usdToMicros(0.3));
    expect(ledger.committedMicros).toBe(usdToMicros(0.6));
  });

  it("throws before spend when a reservation would exceed the cap", () => {
    const ledger = new CostLedger(0.5);
    ledger.reserve("a", usdToMicros(0.3));
    expect(() => {
      ledger.reserve("b", usdToMicros(0.3));
    }).toThrow(CostCapExceededError);
    // The rejected reservation must not land partially — cap breach is atomic.
    expect(ledger.committedMicros).toBe(usdToMicros(0.3));
  });

  it("rejects a duplicate reservation for the same attempt id", () => {
    const ledger = new CostLedger(1);
    ledger.reserve("a", usdToMicros(0.1));
    expect(() => {
      ledger.reserve("a", usdToMicros(0.1));
    }).toThrow("already on the ledger");
  });

  it("finish() replaces the estimate with the actual cost", () => {
    const ledger = new CostLedger(1);
    ledger.reserve("a", usdToMicros(0.5));
    ledger.finish("a", usdToMicros(0.31));
    expect(ledger.committedMicros).toBe(usdToMicros(0.31));
    expect(ledger.actualKnownMicros).toBe(usdToMicros(0.31));
  });

  it("finish(null) keeps the reservation's estimate as the committed cost but leaves the actual total unknown", () => {
    const ledger = new CostLedger(1);
    ledger.reserve("a", usdToMicros(0.2));
    ledger.finish("a", null);
    expect(ledger.committedMicros).toBe(usdToMicros(0.2));
    // Unknown must stay distinguishable from a confirmed $0 (BRIEF.md rule 9).
    expect(ledger.actualKnownMicros).toBeNull();
  });

  it("actualKnownMicros distinguishes 'no data yet' from a confirmed zero total", () => {
    const ledger = new CostLedger(1);
    expect(ledger.actualKnownMicros).toBeNull();

    ledger.reserve("a", usdToMicros(0.1));
    ledger.finish("a", 0);
    expect(ledger.actualKnownMicros).toBe(0);
  });

  it("throws when finishing an attempt that was never reserved", () => {
    const ledger = new CostLedger(1);
    expect(() => {
      ledger.finish("missing", 0);
    }).toThrow("is not reserved");
  });

  it("throws when finishing an already-finished attempt", () => {
    const ledger = new CostLedger(1);
    ledger.reserve("a", usdToMicros(0.1));
    ledger.finish("a", usdToMicros(0.1));
    expect(() => {
      ledger.finish("a", usdToMicros(0.1));
    }).toThrow("is not reserved");
  });
});
