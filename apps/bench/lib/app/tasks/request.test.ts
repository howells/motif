import { describe, expect, it } from "vitest";

import { parseTaskRequest, toTaskInput } from "./request";

const KEY = "6a4f1b9e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";
const SOURCE = `ast_${"1".repeat(32)}`;
const MASK = `ast_${"2".repeat(32)}`;
const IMAGES = {
  mask: "data:mask",
  references: [],
  source: { height: 600, url: "data:source", width: 800 },
};

const parsed = (body: unknown) => {
  const result = parseTaskRequest(body);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.request;
};

describe("parseTaskRequest", () => {
  it("refuses a Task the App doesn't offer yet, by name", () => {
    expect(
      parseTaskRequest({ idempotencyKey: KEY, task: "animate" })
    ).toStrictEqual({
      message: "animate isn't in the App yet. It runs in the terminal.",
      ok: false,
    });
    expect(parseTaskRequest({})).toMatchObject({
      message: "Name a Task.",
      ok: false,
    });
  });

  it("refuses an option the App doesn't offer instead of dropping it", () => {
    const result = parseTaskRequest({
      idempotencyKey: KEY,
      prompt: "x",
      seed: 4,
      task: "generate",
    });
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.message).toContain("seed");
  });

  it("refuses URLs in place of Library images", () => {
    expect(
      parseTaskRequest({
        idempotencyKey: KEY,
        sourceAssetId: "https://evil.example/a.png",
        task: "cutout",
      })
    ).toMatchObject({ ok: false });
  });

  it("refuses an unknown Look, a missing upscale factor and a run without an idempotency key", () => {
    expect(
      parseTaskRequest({
        idempotencyKey: KEY,
        look: "nope",
        prompt: "x",
        task: "generate",
      }).ok
    ).toBe(false);
    expect(
      parseTaskRequest({
        idempotencyKey: KEY,
        sourceAssetId: SOURCE,
        task: "upscale",
      }).ok
    ).toBe(false);
    expect(parseTaskRequest({ prompt: "x", task: "generate" }).ok).toBe(false);
  });

  it("caps images per run", () => {
    expect(
      parseTaskRequest({
        count: 5,
        idempotencyKey: KEY,
        prompt: "x",
        task: "generate",
      }).ok
    ).toBe(false);
  });
});

describe("toTaskInput", () => {
  it("maps each erase mode to the SDK's", () => {
    const base = { idempotencyKey: KEY, sourceAssetId: SOURCE, task: "erase" };
    expect(
      toTaskInput(parsed({ ...base, mode: "paint", maskAssetId: MASK }), IMAGES)
    ).toMatchObject({
      image: "data:source",
      mask: "data:mask",
    });
    expect(
      toTaskInput(
        parsed({ ...base, fill: "a vase", maskAssetId: MASK, mode: "paint" }),
        IMAGES
      )
    ).toMatchObject({ mask: "data:mask", mode: "with", prompt: "a vase" });
    expect(
      toTaskInput(
        parsed({
          ...base,
          boxes: [{ height: 5, width: 5, x: 0, y: 0 }],
          mode: "boxes",
        }),
        IMAGES
      )
    ).toMatchObject({ mode: "boxes" });
    expect(
      toTaskInput(parsed({ ...base, mode: "text" }), IMAGES)
    ).toMatchObject({ mode: "text" });
  });

  it("passes the Source size, so a reframe or upscale can be priced", () => {
    const input = toTaskInput(
      parsed({
        detail: "creative",
        idempotencyKey: KEY,
        scale: 4,
        sourceAssetId: SOURCE,
        task: "upscale",
      }),
      IMAGES,
      "topaz-generative"
    );
    expect(input).toMatchObject({
      mode: "creative",
      model: "topaz-generative",
      scale: 4,
      sourceSize: { height: 600, width: 800 },
    });
  });
});

describe("GPT Image 2.6 options", () => {
  it("turns format, frames and quality into the SDK's fields", () => {
    const request = parsed({
      format: "gif",
      frames: { count: 12, durationMs: 120 },
      idempotencyKey: KEY,
      model: "flare",
      prompt: "a flame",
      quality: "max",
      task: "generate",
    });
    expect(toTaskInput(request, IMAGES)).toMatchObject({
      outputFormat: "gif",
      params: { frame_count: 12, frame_duration_ms: 120, quality: "max" },
    });
  });

  it("refuses frames without a GIF, and frames or quality without a Model", () => {
    const base = { idempotencyKey: KEY, prompt: "a flame", task: "generate" };
    const framesAlone = parseTaskRequest({
      ...base,
      frames: { count: 4, durationMs: 100 },
      model: "flare",
    });
    expect(framesAlone.ok ? "" : framesAlone.message).toContain("GIF");
    const qualityAlone = parseTaskRequest({ ...base, quality: "low" });
    expect(qualityAlone.ok ? "" : qualityAlone.message).toContain(
      "Choose a Model"
    );
    expect(
      parseTaskRequest({
        ...base,
        format: "svg",
        task: "vary",
        sourceAssetId: SOURCE,
      })
    ).toMatchObject({ ok: false });
  });

  it("sends a vary's markup with its Source", () => {
    const request = parsed({
      idempotencyKey: KEY,
      markupAssetId: MASK,
      sourceAssetId: SOURCE,
      task: "vary",
    });
    expect(
      toTaskInput(request, { ...IMAGES, markup: "data:markup" })
    ).toMatchObject({ image: "data:source", markup: "data:markup" });
  });
});
