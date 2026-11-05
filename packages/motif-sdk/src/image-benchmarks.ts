/**
 * Arena image scores captured for MOT-72 on October 29, 2026. Flare and
 * Sunburst route to GPT Image 2.6 but keep 2.5's scores until 2.6 is
 * benchmarked; `evaluatedModel` names what was measured.
 */
export type ImageBenchmarkTask = "text-to-image" | "image-edit-single-image";

interface ArenaScore {
  readonly elo: number;
  readonly rank: number;
  /** The reported plus-or-minus interval, in Elo points. */
  readonly uncertainty: number;
  /** Exact leaderboard label, including a setting where one was reported. */
  readonly evaluatedModel: string;
  readonly preliminary?: true;
  readonly votes?: number;
}

/** Scores are comparable only on the same board and snapshot. */
export interface ImageModelBenchmark extends ArenaScore {
  readonly source: string;
  readonly snapshotDate: string;
  readonly task: ImageBenchmarkTask;
}

type ArenaScoreTable = Readonly<Partial<Record<string, ArenaScore>>>;

const TEXT_TO_IMAGE = {
  sunburst: {
    elo: 1427,
    rank: 1,
    uncertainty: 5,
    evaluatedModel: "GPT-Image-2.5 Sunburst",
    preliminary: true,
    votes: 40_323,
  },
  flare: {
    elo: 1401,
    rank: 2,
    uncertainty: 5,
    evaluatedModel: "GPT-Image-2.5 Flare",
    preliminary: true,
    votes: 39_218,
  },
  gpt2: {
    elo: 1381,
    rank: 3,
    uncertainty: 4,
    evaluatedModel: "GPT-Image-2 (Medium)",
    votes: 103_385,
  },
  banana21: {
    elo: 1325,
    rank: 5,
    uncertainty: 9,
    evaluatedModel: "Nano Banana 2.1",
    preliminary: true,
    votes: 5290,
  },
  "grok-image-2": {
    elo: 1317,
    rank: 6,
    uncertainty: 7,
    evaluatedModel: "Grok Imagine Image 2.0",
    preliminary: true,
    votes: 10_902,
  },
  "muse-image": {
    elo: 1269,
    rank: 8,
    uncertainty: 5,
    evaluatedModel: "Muse Image (Meta)",
    votes: 53_444,
  },
  qwen3: {
    elo: 1254,
    rank: 9,
    uncertainty: 6,
    evaluatedModel: "Qwen-Image-3.0-Pro",
    votes: 11_444,
  },
  "mai-image-2.5": {
    elo: 1253,
    rank: 10,
    uncertainty: 4,
    evaluatedModel: "MAI-Image-2.5",
    votes: 61_286,
  },
  seedream5: {
    elo: 1250,
    rank: 11,
    uncertainty: 4,
    evaluatedModel: "Seedream 5.0 Pro",
    votes: 105_824,
  },
  "banana2-lite": {
    elo: 1249,
    rank: 12,
    uncertainty: 6,
    evaluatedModel: "Nano Banana 2 Lite",
    votes: 17_813,
  },
  banana: {
    elo: 1246,
    rank: 13,
    uncertainty: 3,
    evaluatedModel: "Nano Banana Pro (2K)",
    votes: 188_288,
  },
  gpt: {
    elo: 1236,
    rank: 14,
    uncertainty: 3,
    evaluatedModel: "GPT-Image-1.5 (High Fidelity)",
    votes: 174_012,
  },
  ideogram4: {
    elo: 1200,
    rank: 15,
    uncertainty: 4,
    evaluatedModel: "Ideogram 4.0 (Quality)",
    votes: 72_865,
  },
  "flux2-flex": {
    elo: 1156,
    rank: 17,
    uncertainty: 3,
    evaluatedModel: "FLUX.2 [flex]",
    votes: 156_876,
  },
} satisfies ArenaScoreTable;

const IMAGE_EDITING = {
  sunburst: {
    elo: 1517,
    rank: 1,
    uncertainty: 5,
    evaluatedModel: "GPT-Image-2.5 Sunburst",
    preliminary: true,
  },
  flare: {
    elo: 1482,
    rank: 2,
    uncertainty: 5,
    evaluatedModel: "GPT-Image-2.5 Flare",
    preliminary: true,
  },
  gpt2: {
    elo: 1460,
    rank: 4,
    uncertainty: 3,
    evaluatedModel: "GPT-Image-2 (Medium)",
  },
  "grok-image-2": {
    elo: 1439,
    rank: 5,
    uncertainty: 6,
    evaluatedModel: "Grok Imagine Image 2.0",
    preliminary: true,
  },
  banana21: {
    elo: 1427,
    rank: 7,
    uncertainty: 6,
    evaluatedModel: "Nano Banana 2.1",
    preliminary: true,
  },
  "mai-image-2.5": {
    elo: 1400,
    rank: 9,
    uncertainty: 4,
    evaluatedModel: "MAI-Image-2.5",
  },
  "muse-image": {
    elo: 1400,
    rank: 10,
    uncertainty: 4,
    evaluatedModel: "Muse Image (Meta)",
  },
  "grok-image-quality": {
    elo: 1391,
    rank: 11,
    uncertainty: 6,
    evaluatedModel: "Grok Imagine Image (Quality, 20260519)",
  },
  seedream5: {
    elo: 1390,
    rank: 12,
    uncertainty: 3,
    evaluatedModel: "Seedream 5.0 Pro",
  },
  banana: {
    elo: 1390,
    rank: 13,
    uncertainty: 3,
    evaluatedModel: "Nano Banana Pro (2K)",
  },
  gpt: {
    elo: 1368,
    rank: 14,
    uncertainty: 3,
    evaluatedModel: "GPT-Image-1.5 (High Fidelity)",
  },
} satisfies ArenaScoreTable;

const BOARDS: Readonly<Record<ImageBenchmarkTask, ArenaScoreTable>> = {
  "text-to-image": TEXT_TO_IMAGE,
  "image-edit-single-image": IMAGE_EDITING,
};

const SOURCES: Readonly<Record<ImageBenchmarkTask, string>> = {
  "text-to-image": "https://arena.ai/leaderboard/image/text-to-image",
  "image-edit-single-image":
    "https://arena.ai/leaderboard/image/image-edit/single-image",
};

/** A published score for this route, or null when no matching score was saved. */
export function imageModelBenchmark(
  model: string,
  task: ImageBenchmarkTask
): ImageModelBenchmark | null {
  const score = BOARDS[task][model];
  if (score === undefined) {
    return null;
  }
  return {
    ...score,
    source: SOURCES[task],
    snapshotDate: "2026-10-29",
    task,
  };
}
