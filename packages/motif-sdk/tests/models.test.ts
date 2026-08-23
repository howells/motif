import { describe, expect, it } from "vitest";

import {
  IMAGE_EDITING_TOP_20,
  IMAGE_TEXT_TO_IMAGE_TOP_20,
} from "../src/leaderboards";
import { EDIT_CAPABLE_MODELS, GENERATION_MODELS, MODELS } from "../src/models";
import type { LeaderboardMetric } from "../src/types";

describe("EDIT_CAPABLE_MODELS", () => {
  it("includes exactly the generation models whose config supports editing", () => {
    for (const id of GENERATION_MODELS) {
      expect(EDIT_CAPABLE_MODELS.includes(id)).toBe(
        Boolean(MODELS[id]?.supportsEdit)
      );
    }
  });

  it("excludes text-to-image-only models", () => {
    expect(EDIT_CAPABLE_MODELS).not.toContain("recraft");
    expect(EDIT_CAPABLE_MODELS).not.toContain("ideogram");
    expect(EDIT_CAPABLE_MODELS).not.toContain("qwen");
    expect(EDIT_CAPABLE_MODELS).not.toContain("flux-fast");
  });

  it("includes edit-capable models", () => {
    expect(EDIT_CAPABLE_MODELS).toContain("banana");
    expect(EDIT_CAPABLE_MODELS).toContain("gpt");
  });
});

// THE BENCHMARK NUMBERS ARE COPIED BY HAND FROM ARTIFICIAL ANALYSIS AND DRIFTED ONCE ALREADY.
//
// Before this guard existed, `gemini3` carried `seedream4`'s ELO and rank, `seedream5-lite`
// carried `flux2-max`'s, and `ideogram4` carried `grok-image`'s - three pairs of identical
// numbers that nobody had reason to look at twice. A model's own record said it ranked 6th when
// the leaderboard beside it said 16th, and both shipped through the MCP server as fact.
//
// So the two sources check each other. A rank in MODELS that contradicts the snapshot is a
// transcription error, and a routableModelId naming a model that does not exist is a rename
// nobody finished.
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

  it("carries no two models with identical ELO and rank on the same board", () => {
    const dupes = BOARDS.flatMap(({ metric }) => {
      // Nano Banana Pro and Gemini 3 Pro are the SAME model on two fal endpoints, so they
      // legitimately share a score. Everything else sharing one is a copy-paste.
      const scored = Object.entries(MODELS)
        .filter(([id]) => id !== "gemini3" && id !== "banana")
        .map(([id, config]) => ({
          id,
          held: config.benchmark?.artificialAnalysis?.[metric],
        }))
        .filter(
          (row): row is { held: LeaderboardMetric; id: string } =>
            row.held !== undefined
        );
      const seen = new Map<string, string>();
      return scored.flatMap(({ held, id }) => {
        const key = `${String(held.elo)}/${String(held.rank)}`;
        const prior = seen.get(key);
        seen.set(key, id);
        return prior === undefined
          ? []
          : [`${metric}: ${prior} and ${id} both claim ${key}`];
      });
    });
    expect(dupes).toEqual([]);
  });
});
