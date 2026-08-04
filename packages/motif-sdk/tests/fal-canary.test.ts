import { describe, expect, it } from "vitest";

import { getFalKeyFromEnv, MotifServer } from "../src/index";

// Test-runner control flow (skip this whole live-API suite unless opted
// into), not application config — motifEnvSchema only models FAL_KEY, the
// one env var the SDK itself reads. RUN_FAL_CANARY is this test file's own
// switch, so it reads process.env directly rather than growing the SDK's
// schema for a variable only this describe block cares about.
const describeCanary =
  // oxlint-disable-next-line no-restricted-properties -- see comment above
  process.env.RUN_FAL_CANARY === "1" ? describe : describe.skip;

describeCanary("fal live canaries", () => {
  it("generates one low-cost image with advanced generation controls", async () => {
    const apiKey = getFalKeyFromEnv();
    expect(apiKey, "FAL_KEY is required when RUN_FAL_CANARY=1").toBeTruthy();

    const motif = new MotifServer({ apiKey: apiKey ?? "", retries: 1 });
    const result = await motif.generate({
      aspect: "4:3",
      guidanceScale: 3,
      model: "flux-fast",
      numImages: 1,
      numInferenceSteps: 4,
      outputFormat: "jpeg",
      prompt:
        "plain product photo of a matte blue cube on white seamless, centered",
      seed: 1234,
      syncMode: false,
    });

    const value = result._unsafeUnwrap();
    expect(value.images).toHaveLength(1);
    expect(value.images[0]?.url).toMatch(/^https?:\/\//u);
  }, 120_000);

  it("runs one live SAM 3 image tool request with non-default options", async () => {
    const apiKey = getFalKeyFromEnv();
    expect(apiKey, "FAL_KEY is required when RUN_FAL_CANARY=1").toBeTruthy();

    const motif = new MotifServer({ apiKey: apiKey ?? "", retries: 1 });
    const result = await motif.runTool({
      input:
        "https://raw.githubusercontent.com/facebookresearch/segment-anything/main/notebooks/images/truck.jpg",
      options: {
        apply_mask: false,
        max_masks: 1,
        output_format: "png",
        prompt: "truck",
      },
      tool: "sam3-image",
    });

    const value = result._unsafeUnwrap();
    expect(value).toEqual(expect.any(Object));
    expect(Object.keys(value).length).toBeGreaterThan(0);
  }, 120_000);
});
