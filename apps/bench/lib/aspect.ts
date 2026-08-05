/**
 * Aspect coercion is lossy and NOT uniform (`docs/arc/bench/BRIEF.md`,
 * "Aspect coercion is lossy and NOT uniform — this matters"). One requested
 * aspect becomes three different real aspects depending on a model's
 * `sizeMode`: `aspect_ratio` models honor it exactly, `image_size_enum`
 * models snap it to the nearest named fal preset, and `gpt`'s `gpt_size`
 * dialect only has three fixed sizes. `1:1` is the only value where all
 * three dialects agree — every other aspect makes a quality comparison
 * across models dishonest unless the viewer is warned.
 */
export const BENCH_ASPECTS = [
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
] as const;
export type BenchAspect = (typeof BENCH_ASPECTS)[number];

export const UNIFORM_ASPECT: BenchAspect = "1:1";

export const isUniformAspect = (aspect: string): boolean =>
  aspect === UNIFORM_ASPECT;

/** Verbatim from `BRIEF.md`'s aspect table — the three sizing dialects' real
 * output for each requested aspect, shown in the warning so the discrepancy
 * is concrete rather than an abstract "framing may differ" disclaimer. */
export const ASPECT_DIALECT_TABLE: Record<
  BenchAspect,
  { aspectRatio: string; falImageSizeEnum: string; gptSize: string }
> = {
  "1:1": {
    aspectRatio: "1:1 (1.000)",
    falImageSizeEnum: "square_hd (1.000)",
    gptSize: "1024×1024 (1.000)",
  },
  "2:3": {
    aspectRatio: "2:3 (0.667)",
    falImageSizeEnum: "portrait_4_3 (0.750)",
    gptSize: "1024×1536 (0.667)",
  },
  "3:2": {
    aspectRatio: "3:2 (1.500)",
    falImageSizeEnum: "landscape_4_3 (1.333)",
    gptSize: "1536×1024 (1.500)",
  },
  "3:4": {
    aspectRatio: "3:4 (0.750)",
    falImageSizeEnum: "portrait_4_3 (0.750)",
    gptSize: "1024×1536 (0.667)",
  },
  "4:3": {
    aspectRatio: "4:3 (1.333)",
    falImageSizeEnum: "landscape_4_3 (1.333)",
    gptSize: "1536×1024 (1.500)",
  },
  "9:16": {
    aspectRatio: "9:16 (0.563)",
    falImageSizeEnum: "portrait_16_9 (0.563)",
    gptSize: "1024×1536 (0.667)",
  },
  "16:9": {
    aspectRatio: "16:9 (1.778)",
    falImageSizeEnum: "landscape_16_9 (1.778)",
    gptSize: "1536×1024 (1.500)",
  },
};
