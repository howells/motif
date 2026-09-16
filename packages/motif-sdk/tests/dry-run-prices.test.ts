import { describe, expect, it } from "vitest";

import { createMotif } from "../src/index";
import type { TaskId, TaskInput } from "../src/index";
import { measuredToolCost } from "../src/tool-cost";
import { FAL_TOOLS } from "../src/tools";

const IMAGE = "https://example.com/source.png";
const VIDEO = "https://example.com/clip.mp4";

/** A 1MP source, so a per-megapixel price reads straight off the rate. */
const ONE_MEGAPIXEL = { height: 1000, width: 1000 };

/** A dry-run plan with no key, as `motif --dry-run` makes it. */
function planned(task: TaskId, input: TaskInput) {
  const result = createMotif({
    fetch: () => {
      throw new Error("plan must not fetch");
    },
  }).plan(task, input, { dryRun: true });
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

function expectProjected(
  task: TaskId,
  input: TaskInput,
  model: string,
  usd: number
): void {
  const plan = planned(task, input);
  expect(plan.model).toBe(model);
  expect(plan.cost.basis).toBe("projected");
  expect(plan.cost.usd).not.toBeNull();
  expect(plan.cost.usd).toBeCloseTo(usd, 8);
}

describe("dry-run prices", () => {
  it("prices Clarity per output megapixel: source times the factor squared", () => {
    expectProjected(
      "upscale",
      { image: IMAGE, model: "clarity", sourceSize: ONE_MEGAPIXEL },
      "clarity",
      0.03 * 4
    );
    expectProjected(
      "upscale",
      { image: IMAGE, model: "clarity", scale: 3, sourceSize: ONE_MEGAPIXEL },
      "clarity",
      0.03 * 9
    );
  });

  it("prices Topaz upscales per started output megapixel step at the default factor", () => {
    expectProjected(
      "upscale",
      { image: IMAGE, mode: "creative", sourceSize: ONE_MEGAPIXEL },
      "topaz-creative",
      0.08 * 2
    );
    expectProjected(
      "upscale",
      { image: IMAGE, mode: "generative", sourceSize: ONE_MEGAPIXEL },
      "topaz-generative",
      0.08
    );
  });

  it("prices SeedVR's seamless upscale per output megapixel", () => {
    expectProjected(
      "tile",
      { image: IMAGE, mode: "upscale", sourceSize: ONE_MEGAPIXEL },
      "seedvr-seamless",
      0.0025 * 4
    );
  });

  it("prices Ideogram tiling at its default square_hd size", () => {
    expectProjected(
      "tile",
      { prompt: "oak parquet" },
      "ideogram-tiling",
      (0.06 * 1024 * 1024) / 1_000_000
    );
  });

  it("prices Patina per map, and Patina Extract per material and map", () => {
    expectProjected(
      "material",
      { image: IMAGE, sourceSize: ONE_MEGAPIXEL },
      "patina",
      0.01 + 0.01 * 5
    );
    const square = (1024 * 1024) / 1_000_000;
    expectProjected(
      "material",
      { image: IMAGE, mode: "extract", prompt: "the wood" },
      "patina-extract",
      0.1 + 0.02 * square + 0.01 * 5 * square
    );
  });

  it("prices FLUX.2 outpainting by its first output megapixel and every further one", () => {
    // 1200x1200 out rounds up to 2MP, 1MP in: $0.03 + 2 x $0.015.
    expectProjected(
      "reframe",
      {
        image: IMAGE,
        margin: { bottom: 100, left: 100, right: 100, top: 100 },
        mode: "margin",
        sourceSize: ONE_MEGAPIXEL,
      },
      "flux-outpaint",
      0.06
    );
  });

  it("prices Smart Resize per target size, doubled at 4K, plus the analysis fee", () => {
    const sizes = [
      { height: 1920, width: 1080 },
      { height: 630, width: 1200 },
    ];
    expectProjected(
      "reframe",
      { image: IMAGE, mode: "sizes", sizes },
      "smart-resize",
      0.15 * 2 + 0.05
    );
    expectProjected(
      "reframe",
      {
        image: IMAGE,
        mode: "sizes",
        model: "smart-resize",
        params: { resolution: "4K" },
        sizes,
      },
      "smart-resize",
      0.3 * 2 + 0.05
    );
  });

  it("prices OCR and moderation per input image", () => {
    expectProjected("ask", { image: IMAGE, mode: "read" }, "got-ocr", 0.05);
    expectProjected("ask", { image: IMAGE, mode: "safe" }, "nsfw", 0.001);
  });

  it("prices Moondream from its token rates and estimated tokens", () => {
    expectProjected(
      "ask",
      { image: IMAGE, prompt: "what is this?" },
      "moondream-query",
      (0.4 * 737 + 3.5 * 500) / 1_000_000
    );
  });

  it("prices per-second video background removal from the source's length", () => {
    expectProjected(
      "cutout",
      { sourceVideo: { seconds: 4 }, video: VIDEO },
      "bria-video-rmbg-v3",
      0.2
    );
    expect(planned("cutout", { video: VIDEO }).cost).toStrictEqual({
      basis: "unknown",
      usd: null,
    });
  });

  it("prices Topaz video by output resolution tier, frame rate and length", () => {
    const sourceVideo = { fps: 30, height: 1080, seconds: 10, width: 1920 };
    // 1080 lines at the default 2x is above 1080p: $0.08 a second.
    expectProjected(
      "upscale",
      { sourceVideo, video: VIDEO },
      "topaz-video",
      0.8
    );
    expectProjected(
      "upscale",
      {
        model: "topaz-video",
        params: { target_fps: 60 },
        sourceVideo,
        video: VIDEO,
      },
      "topaz-video",
      1.6
    );
  });

  it("prices the endpoints fal lists at $0 as free, projected and measured", () => {
    expectProjected("cutout", { image: IMAGE }, "birefnet", 0);
    expectProjected("map", { image: IMAGE }, "depth-anything", 0);
    expectProjected("segment", { image: IMAGE, mode: "auto" }, "sam2-auto", 0);
    expect(measuredToolCost(FAL_TOOLS.birefnet.price, [])).toStrictEqual({
      basis: "measured",
      usd: 0,
    });
  });

  it("prices Qwen layers per call", () => {
    expectProjected("layers", { image: IMAGE }, "qwen-layered", 0.05);
  });

  it("prices SAM 3 video per started 16 frames", () => {
    expectProjected(
      "segment",
      {
        prompt: "the lamp",
        sourceVideo: { frames: 100, seconds: 4 },
        video: VIDEO,
      },
      "sam3-video",
      0.005 * 7
    );
  });
});
