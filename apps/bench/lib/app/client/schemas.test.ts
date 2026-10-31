import { describe, expect, it } from "vitest";

import type { Generation } from "../tasks/store";
import { generationView, stackView } from "../views";
import { GenerationViewSchema, QuoteSchema, StackViewSchema } from "./schemas";

const generation: Generation = {
  boundMicros: 40_000,
  comparisonId: null,
  completedAt: new Date("2026-10-01T10:00:20Z"),
  costBasis: "measured",
  costMicros: 39_000,
  costStatus: "settled",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  data: {},
  endpoint: "fal-ai/example",
  errorCode: null,
  errorMessage: null,
  holdId: "hold_1",
  id: "gen_1",
  input: { idempotencyKey: "k", prompt: "a jug" },
  leaseUntil: null,
  maskAssetId: null,
  mode: null,
  model: "banana21",
  outputAssetIds: ["ast_1"],
  ownerId: "mem_1",
  parentId: null,
  prompt: "a jug",
  providerMs: 18_000,
  referenceAssetIds: [],
  requestId: "abcd-1234-efgh",
  retryOf: null,
  sourceAssetId: null,
  stackId: "stk_1",
  status: "completed",
  submittedAt: new Date("2026-10-01T10:00:01Z"),
  task: "generate",
  tier: "balanced",
};

describe("the browser's reply schemas", () => {
  it("accept what the server's views produce", () => {
    expect(
      GenerationViewSchema.safeParse(generationView(generation)).success
    ).toBe(true);
    expect(
      StackViewSchema.safeParse(
        stackView({
          comparisonId: null,
          completedAt: new Date("2026-10-01T10:00:20Z"),
          costMicros: 39_000,
          latestId: "gen_1",
          model: "banana21",
          outputAssetIds: [],
          prompt: null,
          stackId: "stk_1",
          task: "generate",
          versions: 1,
        })
      ).success
    ).toBe(true);
  });

  it("refuse a reply that has drifted from the contract", () => {
    const view = generationView(generation);
    expect(
      GenerationViewSchema.safeParse({ ...view, status: "queued" }).success
    ).toBe(false);
    expect(
      QuoteSchema.safeParse({ kind: "ready", model: "banana21" }).success
    ).toBe(false);
  });
});
