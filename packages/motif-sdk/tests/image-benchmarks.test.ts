import { describe, expect, it } from "vitest";

import { TASKS } from "../src/tasks";

const gpt2 = (models: readonly { readonly model: string }[]) =>
  models.find(({ model }) => model === "gpt2");

describe("published image ranking evidence", () => {
  it("keeps creation and single-image editing scores on separate boards", () => {
    expect(gpt2(TASKS.generate.models)).toMatchObject({
      benchmark: {
        elo: 1381,
        rank: 3,
        uncertainty: 4,
        votes: 103_385,
        source: "https://arena.ai/leaderboard/image/text-to-image",
        snapshotDate: "2026-10-29",
        task: "text-to-image",
      },
    });
    expect(gpt2(TASKS.vary.models)).toMatchObject({
      benchmark: {
        elo: 1460,
        rank: 4,
        source: "https://arena.ai/leaderboard/image/image-edit/single-image",
        snapshotDate: "2026-10-29",
        task: "image-edit-single-image",
      },
    });
    expect(gpt2(TASKS.vary.models)).not.toHaveProperty("benchmark.votes");
  });

  it("preserves the benchmark variant rather than presenting every setting as equivalent", () => {
    expect(
      TASKS.generate.models.find(({ model }) => model === "gpt2")?.benchmark
    ).toMatchObject({
      elo: 1381,
      evaluatedModel: "GPT-Image-2 (Medium)",
    });
    expect(
      TASKS.vary.models.find(({ model }) => model === "banana")?.benchmark
    ).toMatchObject({
      evaluatedModel: "Nano Banana Pro (2K)",
    });
  });

  it("scores Flare and Sunburst as GPT Image 2.5 until 2.6 is benchmarked", () => {
    expect(TASKS.generate.models[0]).toMatchObject({
      model: "sunburst",
      benchmark: { elo: 1427, evaluatedModel: "GPT-Image-2.5 Sunburst" },
    });
    expect(TASKS.vary.models[0]).toMatchObject({
      model: "sunburst",
      benchmark: { elo: 1517, task: "image-edit-single-image" },
    });
  });

  it("leaves unmeasured routes unscored, including Krea's non-Ultra route", () => {
    expect(
      TASKS.vary.models.find(({ model }) => model === "krea3")?.benchmark
    ).toBeNull();
    expect(
      TASKS.generate.models.find(({ model }) => model === "flux2-pro")
        ?.benchmark
    ).toBeNull();
    expect(
      TASKS.generate.models.find(({ model }) => model === "flux2-flex")
        ?.benchmark
    ).toMatchObject({
      elo: 1156,
      rank: 17,
    });
  });
});
