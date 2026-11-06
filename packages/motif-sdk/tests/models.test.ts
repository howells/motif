import { describe, expect, it } from "vitest";

import {
  IMAGE_EDITING_TOP_20,
  IMAGE_TEXT_TO_IMAGE_TOP_20,
} from "../src/leaderboards";
import { EDIT_CAPABLE_MODELS, GENERATION_MODELS, MODELS } from "../src/models";

describe("EDIT_CAPABLE_MODELS", () => {
  it("includes exactly the generation models whose config supports editing", () => {
    for (const id of GENERATION_MODELS) {
      expect(EDIT_CAPABLE_MODELS.includes(id)).toBe(
        Boolean(MODELS[id]?.supportsEdit)
      );
    }
  });
});

// The leaderboard snapshots and the model registry each carry a hand-copied rank, so they
// must agree, and every routable id must name a model that exists.
describe("leaderboard snapshots agree with the model registry", () => {
  const BOARDS = [
    { board: IMAGE_TEXT_TO_IMAGE_TOP_20, metric: "textToImage" },
    { board: IMAGE_EDITING_TOP_20, metric: "editing" },
  ] as const;

  it("routes every snapshot entry to a model that exists", () => {
    const dangling = BOARDS.flatMap(({ board }) =>
      board.entries
        .map((entry) => entry.routableModelId)
        .filter((id) => id !== undefined && MODELS[id] === undefined)
    );
    expect(dangling).toEqual([]);
  });

  it("never states a rank that contradicts the snapshot", () => {
    const conflicts = BOARDS.flatMap(({ board, metric }) =>
      board.entries.flatMap((entry) => {
        const id = entry.routableModelId;
        if (id === undefined) {
          return [];
        }
        const held = MODELS[id]?.benchmark?.artificialAnalysis?.[metric];
        if (held === undefined) {
          return [];
        }
        return held.rank === entry.rank && held.elo === entry.elo
          ? []
          : [
              `${id} ${metric}: registry says ${String(held.elo)}/#${String(held.rank)}, ` +
                `snapshot says ${String(entry.elo)}/#${String(entry.rank)}`,
            ];
      })
    );
    expect(conflicts).toEqual([]);
  });
});
