import { describe, expect, it } from "vitest";

import type { GenerationView } from "../views";
import { chargeLine } from "./charge";

const generation = (
  costStatus: GenerationView["costStatus"],
  costMicros: number | null = null
): GenerationView => ({
  boundMicros: 221_250,
  comparisonId: null,
  completedAt: null,
  costBasis: null,
  costMicros,
  costStatus,
  createdAt: "2026-10-31T12:00:00.000Z",
  elapsedMs: null,
  error: null,
  id: `gen_${"1".repeat(32)}`,
  input: {},
  mode: null,
  model: "banana2",
  outputs: [],
  parentId: null,
  prompt: null,
  requestRef: null,
  retryOf: null,
  sourceAssetId: null,
  stackId: `gen_${"1".repeat(32)}`,
  status: "failed",
  submittedAt: null,
  task: "generate",
  tier: "balanced",
});

describe("chargeLine", () => {
  it("never says nothing was charged unless the hold was released", () => {
    expect(chargeLine(generation("released"))).toContain("Nothing was charged");
    expect(chargeLine(generation("retained"))).toContain(
      "$0.221 stays counted"
    );
    expect(chargeLine(generation("retained"))).not.toContain(
      "Nothing was charged"
    );
    expect(chargeLine(generation("held"))).toContain("Holding up to $0.221");
    expect(chargeLine(generation("settled", 150_001))).toBe("Charged $0.150.");
  });
});
