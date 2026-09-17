import { describe, expect, it } from "vitest";

import { createMotif, NO_MODEL_AVAILABLE, TASK_IDS } from "../src/index";
import type {
  FalFetch,
  MotifClient,
  TaskFunction,
  TaskId,
  TaskInput,
} from "../src/index";
import { MODELS } from "../src/models";
import { measuredToolCost } from "../src/tool-cost";
import { FAL_TOOLS } from "../src/tools";

interface RecordedCall {
  body: unknown;
  headers: Record<string, string>;
  method: string;
  url: string;
}

interface Reply {
  data: unknown;
  requestId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringHeaders(headers: unknown): Record<string, string> {
  if (!isRecord(headers)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

/** A fake fetch that records every call and answers from `respond`. */
function fakeFetch(respond: (call: RecordedCall) => Reply) {
  const calls: RecordedCall[] = [];
  const fetch: FalFetch = async (url, init) => {
    const { body } = init;
    const call: RecordedCall = {
      body: typeof body === "string" ? JSON.parse(body) : undefined,
      headers: stringHeaders(init.headers),
      method: init.method ?? "GET",
      url,
    };
    calls.push(call);
    const reply = respond(call);
    return await Promise.resolve(
      new Response(JSON.stringify(reply.data), {
        headers: {
          "Content-Type": "application/json",
          ...(reply.requestId !== undefined && {
            "x-fal-request-id": reply.requestId,
          }),
        },
        status: 200,
      })
    );
  };
  return { calls, fetch };
}

const noNetwork = fakeFetch(() => {
  throw new Error("plan must not fetch");
});

function client(fetch: FalFetch = noNetwork.fetch): MotifClient {
  return createMotif({ falKey: "test", fetch, retries: 0 });
}

const IMAGE = "https://example.com/source.png";
const REFERENCE = "https://example.com/reference.png";

function dataUrl(mediaType: string, bytes: number[]): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function uint32(value: number): number[] {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return [...bytes];
}

function uint16(value: number): number[] {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return [...bytes];
}

/** The PNG signature and IHDR chunk: enough header to carry dimensions. */
function pngDataUrl(width: number, height: number): string {
  return dataUrl("image/png", [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...uint32(13),
    ...Buffer.from("IHDR"),
    ...uint32(width),
    ...uint32(height),
    8,
    6,
    0,
    0,
    0,
  ]);
}

/** SOI, an APP0 segment to skip, then SOF0 with the frame size. */
function jpegDataUrl(width: number, height: number): string {
  return dataUrl("image/jpeg", [
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...uint16(16),
    ...Buffer.from("JFIF\0"),
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0xff,
    0xc0,
    ...uint16(17),
    8,
    ...uint16(height),
    ...uint16(width),
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ]);
}

function planned(task: TaskId, input: TaskInput) {
  const result = client().plan(task, input);
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

function refused(task: TaskId, input: TaskInput) {
  const result = client().plan(task, input);
  if (result.isOk()) {
    throw new Error(`expected ${task} to be refused`);
  }
  return result.error;
}

describe("createMotif plan", () => {
  it.each(TASK_IDS)("plans %s on a dry run without a key", (task) => {
    const needs: Partial<Record<TaskId, TaskInput>> = {
      ask: { prompt: "what is this?" },
      erase: { prompt: "the car" },
      generate: { prompt: "a red chair" },
      reframe: { aspect: "16:9" },
      relight: { prompt: "warm evening light" },
      restyle: { references: [REFERENCE] },
      tile: { prompt: "terracotta tiles" },
      "try-on": { references: [REFERENCE] },
    };
    const input: TaskInput = {
      ...(task === "generate" ? {} : { image: IMAGE }),
      ...needs[task],
    };
    // An empty key reads as no key, and never falls back to FAL_KEY.
    const motif = createMotif({ falKey: "", fetch: noNetwork.fetch });
    const result = motif.plan(task, input, { dryRun: true });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.task).toBe(task);
    expect(plan.endpoint).not.toBe("");
    expect(Object.keys(plan.body).length).toBeGreaterThan(0);
    expect(noNetwork.calls).toHaveLength(0);
  });

  it("plans a transparent GPT Image 2 dry run without an OpenAI key", () => {
    const motif = createMotif({
      falKey: "",
      fetch: noNetwork.fetch,
      openAiKey: "",
    });
    const result = motif.plan(
      "generate",
      { model: "gpt2", prompt: "a red chair", transparent: true },
      { dryRun: true }
    );

    expect(result._unsafeUnwrap().provider).toBe("openai");
  });

  it("maps a banana generation's ratio and count", () => {
    const plan = planned("generate", {
      aspect: "3:2",
      count: 2,
      model: "banana",
      prompt: "a red chair",
    });

    expect(plan.endpoint).toBe(MODELS.banana?.endpoint);
    expect(plan.body).toMatchObject({
      aspect_ratio: "3:2",
      num_images: 2,
      prompt: "a red chair",
    });
    expect(plan.cost.basis).toBe("projected");
  });

  it("sends FLUX.2 Pro 3:2 as exact dimensions", () => {
    const plan = planned("generate", {
      aspect: "3:2",
      model: "flux2-pro",
      prompt: "a harbour",
    });

    expect(plan.body.image_size).toStrictEqual({ height: 672, width: 1008 });
  });

  it("projects a megapixel-priced Model's cost from the exact pixels", () => {
    const plan = planned("generate", {
      aspect: "3:2",
      model: "flux2-max",
      prompt: "a harbour",
    });

    expect(plan.body.image_size).toStrictEqual({ height: 672, width: 1008 });
    expect(plan.cost.basis).toBe("projected");
    expect(plan.cost.usd).toBeCloseTo((0.07 * 1008 * 672) / 1_000_000);
  });

  it("asks for the picture again when vary is given no prompt", () => {
    const plan = planned("vary", { image: IMAGE, model: "banana" });

    // An empty prompt is refused upstream with a 422, so vary must carry one.
    expect(plan.body.prompt).toMatch(/^Another take of this image/);
  });

  it("keeps a prompt passed to vary", () => {
    const plan = planned("vary", {
      image: IMAGE,
      model: "banana",
      prompt: "in cobalt blue",
    });

    expect(plan.body.prompt).toBe("in cobalt blue");
  });

  it("puts vary's source first in image_urls", () => {
    const reference = "https://example.com/reference.png";
    const plan = planned("vary", {
      image: IMAGE,
      model: "banana",
      references: [reference],
    });

    expect(plan.endpoint).toBe(MODELS.banana?.editEndpoint);
    expect(plan.body.image_urls).toStrictEqual([IMAGE, reference]);
  });

  it("sends a plain erase's prompt", () => {
    const plan = planned("erase", { image: IMAGE, prompt: "the car" });

    expect(plan.model).toBe("object-removal");
    expect(plan.body).toMatchObject({ image_url: IMAGE, prompt: "the car" });
  });

  it("chooses a mask Model for an erase with a mask and sends mask_url", () => {
    const mask = "https://example.com/mask.png";
    const plan = planned("erase", { image: IMAGE, mask });

    expect(plan.model).toBe("object-removal-mask");
    expect(plan.body).toMatchObject({ image_url: IMAGE, mask_url: mask });
  });

  it("sends reframe's ratio to Ideogram as an exact image_size", () => {
    const plan = planned("reframe", { aspect: "2:3", image: IMAGE });

    expect(plan.model).toBe("ideogram-reframe");
    expect(plan.body.image_size).toStrictEqual({ height: 1536, width: 1024 });
  });

  it("sends Bria its required canvas_size alongside aspect_ratio", () => {
    const plan = planned("reframe", {
      aspect: "16:9",
      image: IMAGE,
      tier: "fast",
    });

    expect(plan.body).toMatchObject({
      aspect_ratio: "16:9",
      canvas_size: [1536, 864],
    });
  });

  it("converts a pixel box to fractions from a PNG data URL", () => {
    const plan = planned("erase", {
      boxes: [{ height: 100, width: 200, x: 100, y: 200 }],
      image: pngDataUrl(800, 400),
      mode: "boxes",
    });

    expect(plan.model).toBe("object-removal-bbox");
    expect(plan.body.box_prompts).toStrictEqual([
      { x_max: 0.375, x_min: 0.125, y_max: 0.75, y_min: 0.5 },
    ]);
  });

  it("converts a pixel box to fractions from a JPEG data URL", () => {
    const plan = planned("erase", {
      boxes: [{ height: 50, width: 50, x: 0, y: 150 }],
      image: jpegDataUrl(100, 200),
      mode: "boxes",
    });

    expect(plan.body.box_prompts).toStrictEqual([
      { x_max: 0.5, x_min: 0, y_max: 1, y_min: 0.75 },
    ]);
  });

  it("converts a pixel box on an https source using sourceSize", () => {
    const plan = planned("erase", {
      boxes: [{ height: 10, width: 10, x: 10, y: 10 }],
      image: IMAGE,
      mode: "boxes",
      sourceSize: { height: 100, width: 100 },
    });

    expect(plan.body.box_prompts).toStrictEqual([
      { x_max: 0.2, x_min: 0.1, y_max: 0.2, y_min: 0.1 },
    ]);
  });

  it("sends segment boxes in whole pixels", () => {
    const plan = planned("segment", {
      boxes: [{ height: 200, width: 100, x: 10, y: 20 }],
      image: IMAGE,
      model: "sam3-image",
    });

    expect(plan.body.box_prompts).toStrictEqual([
      { x_max: 110, x_min: 10, y_max: 220, y_min: 20 },
    ]);
  });

  it("sends a reframe margin as expand edges", () => {
    const plan = planned("reframe", {
      image: IMAGE,
      margin: { bottom: 0, left: 64, right: 64, top: 128 },
      mode: "margin",
    });

    expect(plan.model).toBe("flux-outpaint");
    expect(plan.body).toMatchObject({
      expand_bottom: 0,
      expand_left: 64,
      expand_right: 64,
      expand_top: 128,
    });
  });

  it("prices params that change the image count or resolution", () => {
    const base = planned("generate", { model: "banana", prompt: "x" });
    const four = planned("generate", {
      model: "banana",
      params: { num_images: 4 },
      prompt: "x",
    });
    const large = planned("generate", {
      model: "banana",
      params: { resolution: "4K" },
      prompt: "x",
    });

    expect(four.cost.usd).toBeCloseTo((base.cost.usd ?? 0) * 4);
    expect(large.cost.usd).toBeCloseTo((base.cost.usd ?? 0) * 2);
  });

  it("prices a megapixel Model's preset from the preset's pixels", () => {
    const plan = planned("generate", {
      aspect: "16:9",
      model: "flux2-pro",
      prompt: "a harbour",
    });

    expect(plan.body.image_size).toBe("landscape_16_9");
    expect(plan.cost.usd).toBeCloseTo((0.03 * 1024 * 576) / 1_000_000);
  });

  it("prices a params image_size inside the Model's bounds", () => {
    const plan = planned("generate", {
      model: "flux2-pro",
      params: { image_size: { height: 1600, width: 1600 } },
      prompt: "a harbour",
    });

    expect(plan.cost.usd).toBeCloseTo((0.03 * 1600 * 1600) / 1_000_000);
  });

  it("lets params override a Motif default the caller didn't set", () => {
    const plan = planned("cutout", {
      image: IMAGE,
      model: "birefnet",
      params: { model: "Portrait" },
    });

    expect(plan.body.model).toBe("Portrait");
  });

  it("sends a fast reframe's ratio to Bria as aspect_ratio", () => {
    const plan = planned("reframe", {
      aspect: "16:9",
      image: IMAGE,
      tier: "fast",
    });

    expect(plan.model).toBe("bria-expand");
    expect(plan.body).toMatchObject({ aspect_ratio: "16:9" });
    expect(plan.body).not.toHaveProperty("image_size");
  });

  it("sends Clarity's scale as upscale_factor", () => {
    const plan = planned("upscale", { image: IMAGE, scale: 2 });

    expect(plan.model).toBe("clarity");
    expect(plan.endpoint).toBe(MODELS.clarity?.endpoint);
    expect(plan.body).toStrictEqual({ image_url: IMAGE, upscale_factor: 2 });
  });

  it("sends restore's colour mode to DDColor", () => {
    const plan = planned("restore", { image: IMAGE, mode: "colour" });

    expect(plan.model).toBe("ddcolor");
    expect(plan.endpoint).toBe(FAL_TOOLS.ddcolor.endpoint);
    expect(plan.mode).toBe("colour");
  });

  it("relights to a mood on IC-Light, joined after the prompt", () => {
    const plan = planned("relight", {
      image: IMAGE,
      mood: "lamplit",
      prompt: "a kitchen table.",
    });

    expect(plan.model).toBe("iclight-v2");
    expect(plan.endpoint).toBe("fal-ai/iclight-v2");
    const prompt =
      "A kitchen table. Evening, warm practical lamps around 2400K, candles and a lit fire, cosy and warm, never gloomy.";
    expect(plan.body).toStrictEqual({ image_url: IMAGE, prompt });
    expect(plan.prompt).toBe(prompt);
  });

  it("relights to a mood alone, and takes a mask to IC-Light", () => {
    const mask = "https://example.com/mask.png";
    const plan = planned("relight", { image: IMAGE, mask, mood: "dawn" });

    expect(plan.model).toBe("iclight-v2");
    expect(plan.endpoint).toBe("fal-ai/iclight-v2");
    expect(plan.body).toStrictEqual({
      image_url: IMAGE,
      mask_image_url: mask,
      prompt: "Early morning light through tall glazing, cool and clear.",
    });
  });

  it("restyles the source after one reference on TeleStyle", () => {
    const plan = planned("restyle", { image: IMAGE, references: [REFERENCE] });

    expect(plan.model).toBe("telestyle-v2");
    expect(plan.endpoint).toBe("fal-ai/telestyle-v2");
    expect(plan.body).toStrictEqual({
      content_image_url: IMAGE,
      style_image_url: REFERENCE,
    });
  });

  it("makes a tile from a prompt with no source", () => {
    const plan = planned("tile", { prompt: "terracotta tiles" });

    expect(plan.model).toBe("ideogram-tiling");
    expect(plan.body).toStrictEqual({ prompt: "terracotta tiles" });
  });

  it("ranks past a Model that can't take the resolution asked for", () => {
    const plan = planned("generate", {
      prompt: "a red chair",
      resolution: "1K",
      tier: "fast",
    });

    expect(MODELS[plan.model]?.supportsResolution).toBe(true);
    // No Model takes both, so the refusal names resolution, not qwen3's.
    const error = refused("generate", {
      negativePrompt: "dogs",
      prompt: "a red chair",
      resolution: "1K",
    });
    expect(error.code).toBe(NO_MODEL_AVAILABLE);
  });

  it("brightens a dark photo on Control Light in restore's dark mode", () => {
    const plan = planned("restore", { image: IMAGE, mode: "dark" });

    expect(plan.model).toBe("control-light");
    expect(plan.endpoint).toBe("fal-ai/control-light");
    expect(plan.body).toStrictEqual({ image_url: IMAGE });
  });

  it("prices a per-image call by num_images, projected and measured", () => {
    const plan = planned("try-on", {
      count: 2,
      image: IMAGE,
      references: [REFERENCE],
    });

    expect(plan.body).toMatchObject({ num_images: 2 });
    expect(plan.cost).toStrictEqual({ basis: "projected", usd: 0.15 });
    expect(
      measuredToolCost(FAL_TOOLS["virtual-try-on"].price, [], plan.body)
    ).toStrictEqual({ basis: "measured", usd: 0.15 });
  });

  it("sends nothing for rig: false and plans it on a Model that can't rig", () => {
    const plan = planned("mesh", { image: IMAGE, rig: false });

    expect(plan.model).toBe("trellis-2");
    expect(plan.body).toStrictEqual({ image_url: IMAGE });
  });

  it("dresses the person in the garment on Google's try-on", () => {
    const plan = planned("try-on", { image: IMAGE, references: [REFERENCE] });

    expect(plan.model).toBe("virtual-try-on");
    expect(plan.endpoint).toBe("google/virtual-try-on");
    expect(plan.queued).toBe(true);
    expect(plan.body).toStrictEqual({
      person_image_url: IMAGE,
      product_image_url: REFERENCE,
    });
    expect(plan.cost).toStrictEqual({ basis: "projected", usd: 0.075 });
  });

  it("makes a quality mesh on Meshy v7", () => {
    const plan = planned("mesh", { image: IMAGE, tier: "quality" });

    expect(plan.model).toBe("meshy-v7");
    expect(plan.endpoint).toBe("meshy/v7/image-to-3d");
    expect(plan.body).toStrictEqual({ image_url: IMAGE });
    expect(plan.cost).toStrictEqual({ basis: "projected", usd: 1.2 });
  });

  it("rigs a mesh on Meshy v7 at any tier and prices the rig", () => {
    const plan = planned("mesh", { image: IMAGE, rig: true });

    expect(plan.model).toBe("meshy-v7");
    expect(plan.body).toStrictEqual({ enable_rigging: true, image_url: IMAGE });
    expect(plan.cost.usd).toBeCloseTo(1.4);
  });

  it("queues animate and sends the image as start_image_url", () => {
    const plan = planned("animate", { image: IMAGE, prompt: "slow pan" });

    expect(plan.model).toBe("kling");
    expect(plan.queued).toBe(true);
    expect(plan.body).toMatchObject({
      duration: "5",
      prompt: "slow pan",
      start_image_url: IMAGE,
    });
  });

  it("sends a fast animate to Kling v3 Turbo Pro as image_url", () => {
    const plan = planned("animate", {
      image: IMAGE,
      prompt: "slow pan",
      tier: "fast",
    });

    expect(plan.model).toBe("kling-turbo");
    expect(plan.endpoint).toBe(
      "fal-ai/kling-video/v3/turbo/pro/image-to-video"
    );
    expect(plan.queued).toBe(true);
    expect(plan.body).toStrictEqual({
      duration: "5",
      image_url: IMAGE,
      prompt: "slow pan",
    });
    expect(plan.cost.usd).toBeCloseTo(0.7);
  });

  it("generates and edits on MAI Image 2.5 Pro with one image_url", () => {
    const plan = planned("generate", {
      aspect: "3:2",
      model: "mai-image-2.5-pro",
      prompt: "a red chair",
    });

    expect(plan.endpoint).toBe("microsoft/mai-image-2.5-pro");
    expect(plan.body).toStrictEqual({
      aspect_ratio: "3:2",
      num_images: 1,
      prompt: "a red chair",
    });
    expect(plan.cost).toStrictEqual({ basis: "projected", usd: 0.17 });

    const edit = planned("vary", { image: IMAGE, model: "mai-image-2.5-pro" });
    expect(edit.endpoint).toBe("microsoft/mai-image-2.5-pro/edit");
    expect(edit.body).toMatchObject({ image_url: IMAGE });
    expect(edit.body).not.toHaveProperty("image_urls");
  });

  it("resolves a transparent generate without an OpenAI key to Ideogram V3 Transparent", () => {
    const motif = createMotif({
      falKey: "test",
      fetch: noNetwork.fetch,
      openAiKey: "",
    });
    const plan = motif
      .plan("generate", { prompt: "a red chair", transparent: true })
      ._unsafeUnwrap();

    expect(plan.model).toBe("ideogram3-transparent");
    expect(plan.provider).toBe("fal");
    expect(plan.endpoint).toBe("fal-ai/ideogram/v3/generate-transparent");
    expect(plan.body).toStrictEqual({
      aspect_ratio: "1:1",
      num_images: 1,
      prompt: "a red chair",
    });
    expect(plan.cost).toStrictEqual({ basis: "projected", usd: 0.06 });
    expect(planned("generate", { prompt: "a red chair" }).model).not.toBe(
      "ideogram3-transparent"
    );
  });

  it("sends a GPT Image 2 edit to /edit with mask_url", () => {
    const mask = "https://example.com/mask.png";
    const plan = planned("generate", {
      mask,
      model: "gpt2",
      prompt: "a red chair",
      references: [REFERENCE],
    });

    expect(plan.endpoint).toBe("openai/gpt-image-2/edit");
    expect(plan.body).toMatchObject({
      image_urls: [REFERENCE],
      mask_url: mask,
    });
    expect(plan.body).not.toHaveProperty("mask_image_url");
  });

  it("generates on Nano Banana 2 Lite without a resolution", () => {
    const plan = planned("generate", {
      model: "banana2-lite",
      prompt: "a red chair",
    });

    expect(plan.endpoint).toBe("google/nano-banana-2-lite");
    expect(plan.body).toStrictEqual({
      aspect_ratio: "1:1",
      num_images: 1,
      prompt: "a red chair",
    });
    expect(plan.cost).toStrictEqual({ basis: "projected", usd: 0.048 });
  });

  it("generates on Recraft V4.1 with an image_size", () => {
    const plan = planned("generate", {
      model: "recraft41",
      prompt: "a red chair",
    });

    expect(plan.endpoint).toBe("fal-ai/recraft/v4.1/text-to-image");
    expect(plan.body).toStrictEqual({
      image_size: "square_hd",
      prompt: "a red chair",
    });
    expect(plan.cost).toStrictEqual({ basis: "projected", usd: 0.035 });
  });

  it("sends Grok Imagine Image 2.0 a lower-case resolution and edits on v2.0", () => {
    const plan = planned("generate", {
      model: "grok-image-2",
      prompt: "a red chair",
    });

    expect(plan.endpoint).toBe("xai/grok-imagine-image/v2.0/text-to-image");
    expect(plan.body).toStrictEqual({
      aspect_ratio: "1:1",
      num_images: 1,
      prompt: "a red chair",
      resolution: "2k",
    });
    expect(plan.cost).toStrictEqual({ basis: "projected", usd: 0.08 });

    const edit = planned("vary", { image: IMAGE, model: "grok-image-2" });
    expect(edit.endpoint).toBe("xai/grok-imagine-image/v2.0/edit");
    expect(edit.body).toMatchObject({ image_urls: [IMAGE] });
  });

  it("projects IC-Light's megapixel price from a data URL source", () => {
    const plan = planned("relight", {
      image: pngDataUrl(2000, 1000),
      mood: "dawn",
    });

    expect(plan.model).toBe("iclight-v2");
    expect(plan.cost.basis).toBe("projected");
    expect(plan.cost.usd).toBeCloseTo(0.1 * 2);
    expect(
      planned("relight", { image: IMAGE, mood: "dawn" }).cost
    ).toStrictEqual({ basis: "unknown", usd: null });
  });

  it("projects TeleStyle's megapixel price from sourceSize", () => {
    const plan = planned("restyle", {
      image: IMAGE,
      references: [REFERENCE],
      sourceSize: { height: 1000, width: 1500 },
    });

    expect(plan.model).toBe("telestyle-v2");
    expect(plan.cost.basis).toBe("projected");
    expect(plan.cost.usd).toBeCloseTo(0.035 * 1.5);
  });

  it("sends mesh objects the prompt naming the objects", () => {
    const plan = planned("mesh", {
      image: IMAGE,
      mode: "objects",
      prompt: "chair",
    });

    expect(plan.model).toBe("sam3-3d-objects");
    expect(plan.body).toStrictEqual({ image_url: IMAGE, prompt: "chair" });
  });

  it("cuts out a video on Bria VRMBG 3.0", () => {
    const plan = planned("cutout", { video: "https://example.com/clip.mp4" });

    expect(plan.model).toBe("bria-video-rmbg-v3");
    expect(plan.endpoint).toBe("bria/video/background-removal/v3");
    expect(plan.body).toMatchObject({
      video_url: "https://example.com/clip.mp4",
    });
  });
});

describe("createMotif refusals", () => {
  it("refuses params without a model", () => {
    const error = refused("generate", {
      params: { style: "vector" },
      prompt: "a chair",
    });

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.details).toStrictEqual({ field: "params", requires: "model" });
  });

  it("refuses params that replace a field the request set", () => {
    const error = refused("generate", {
      aspect: "3:2",
      model: "banana",
      params: { aspect_ratio: "1:1" },
      prompt: "a chair",
    });

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.details).toStrictEqual({
      field: "params",
      key: "aspect_ratio",
    });
  });

  it("refuses params for a field the caller set, whatever its value", () => {
    const error = refused("generate", {
      count: 1,
      model: "banana",
      params: { num_images: 4 },
      prompt: "x",
    });

    expect(error.details).toStrictEqual({ field: "params", key: "num_images" });
  });

  it("refuses a params image_size outside the Model's bounds", () => {
    const error = refused("generate", {
      model: "flux2-pro",
      params: { image_size: { height: 4096, width: 4096 } },
      prompt: "x",
    });

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.details).toMatchObject({
      field: "params",
      key: "image_size",
      model: "flux2-pro",
    });
  });

  it("names the creative field an unknown mood came from", () => {
    const error = refused("generate", {
      look: "editorial",
      mood: "dusk",
      prompt: "x",
    });

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.details).toMatchObject({ field: "mood", task: "generate" });
  });

  it("refuses params that set a source or reference URL", () => {
    const erase = refused("erase", {
      image: IMAGE,
      model: "object-removal",
      params: { image_url: "https://example.com/other.png" },
      prompt: "the car",
    });
    const mesh = refused("mesh", {
      image: IMAGE,
      model: "hunyuan3d-v3",
      params: { back_image_url: "https://example.com/back.png" },
    });

    expect(erase.details).toStrictEqual({ field: "params", key: "image_url" });
    expect(mesh.details).toStrictEqual({
      field: "params",
      key: "back_image_url",
    });
  });

  it("refuses a request missing a parameter fal requires", () => {
    const error = refused("erase", { image: IMAGE });

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.details).toStrictEqual({
      field: "prompt",
      model: "object-removal",
      task: "erase",
    });
  });

  it("refuses an exact size outside the Model's limits", () => {
    const error = refused("generate", {
      aspect: "4:1",
      model: "gpt2",
      prompt: "a banner",
    });

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.details).toMatchObject({
      field: "aspect",
      model: "gpt2",
      task: "generate",
    });
    expect(error.details?.bounds).toMatchObject({ maxRatio: 3 });
  });

  it("refuses a ratio outside Bria's aspect_ratio enum", () => {
    const error = refused("reframe", {
      aspect: "21:9",
      image: IMAGE,
      tier: "fast",
    });

    expect(error.details).toMatchObject({
      field: "aspect",
      model: "bria-expand",
    });
  });

  it("refuses a resolution on a named Model that can't take one", () => {
    const error = refused("generate", {
      model: "flux2-pro",
      prompt: "a chair",
      resolution: "4K",
    });

    expect(error.code).toBe(NO_MODEL_AVAILABLE);
    expect(error.details).toMatchObject({
      blockedBy: "resolution",
      unblockedBy: ["option"],
    });
  });

  it("refuses a generation mask without references", () => {
    const error = refused("generate", {
      mask: "https://example.com/mask.png",
      model: "gpt",
      prompt: "a chair",
    });

    expect(error.details).toStrictEqual({
      field: "mask",
      requires: "references",
    });
  });

  it("refuses boxes it can't place", () => {
    const noSize = refused("erase", {
      boxes: [{ height: 20, width: 20, x: 10, y: 10 }],
      image: IMAGE,
      mode: "boxes",
    });
    const twoBoxes = refused("erase", {
      boxes: [
        { height: 20, width: 20, x: 10, y: 10 },
        { height: 20, width: 20, x: 40, y: 40 },
      ],
      image: pngDataUrl(100, 100),
      mode: "boxes",
    });
    const fractions = refused("segment", {
      boxes: [{ height: 0.5, width: 0.5, x: 0, y: 0 }],
      image: IMAGE,
      model: "sam3-image",
    });
    const unsupported = refused("reframe", {
      aspect: "16:9",
      boxes: [{ height: 20, width: 20, x: 10, y: 10 }],
      image: IMAGE,
    });

    expect(noSize.details).toStrictEqual({
      field: "sourceSize",
      model: "object-removal-bbox",
      task: "erase",
    });
    expect(twoBoxes.details).toMatchObject({ field: "boxes" });
    expect(fractions.details).toMatchObject({ field: "boxes" });
    expect(unsupported.details).toMatchObject({ field: "boxes" });
  });

  it("refuses a margin on a Model with no expand edges", () => {
    const error = refused("reframe", {
      aspect: "16:9",
      image: IMAGE,
      margin: { bottom: 0, left: 0, right: 0, top: 64 },
    });

    expect(error.details).toMatchObject({
      field: "margin",
      model: "ideogram-reframe",
    });
  });

  it("refuses a prompt on a restore Model that takes none", () => {
    const error = refused("restore", { image: IMAGE, prompt: "fix it" });

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.details).toStrictEqual({
      field: "prompt",
      model: "topaz-restore",
      task: "restore",
    });
  });

  it.each([
    ["restyle", []],
    ["restyle", [REFERENCE, REFERENCE]],
    ["try-on", []],
    ["try-on", [REFERENCE, REFERENCE]],
  ] as const)("refuses %s with references %j", (task, references) => {
    const error = refused(task, { image: IMAGE, references });

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.details).toStrictEqual({ field: "references", task });
  });

  it("refuses a relight with no prompt and no mood", () => {
    const error = refused("relight", { image: IMAGE });

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.details).toStrictEqual({ field: "prompt", task: "relight" });
  });

  it("refuses a mood on a Task other than relight", () => {
    const error = refused("erase", {
      image: IMAGE,
      mood: "dawn",
      prompt: "the car",
    });

    expect(error.details).toMatchObject({ field: "mood", task: "erase" });
  });

  it("refuses a tile upscale without an image", () => {
    const error = refused("tile", { mode: "upscale" });

    expect(error.details).toStrictEqual({ field: "image", task: "tile" });
  });

  it("refuses mesh objects without a prompt naming the objects", () => {
    const error = refused("mesh", { image: IMAGE, mode: "objects" });

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.details).toMatchObject({
      field: "prompt",
      model: "sam3-3d-objects",
    });
  });

  it("refuses an erase without an image", () => {
    const error = refused("erase", { prompt: "the car" });

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.details).toMatchObject({ field: "image" });
  });

  it("carries the resolution's details on NO_MODEL_AVAILABLE", () => {
    const error = refused("erase", { image: IMAGE, transparent: true });

    expect(error.code).toBe(NO_MODEL_AVAILABLE);
    expect(error.details).toMatchObject({
      blockedBy: "transparency",
      task: "erase",
    });
    expect(error.details?.unblockedBy).toBeInstanceOf(Array);
  });

  it("refuses to run without a fal key, before any request", async () => {
    const { calls, fetch } = fakeFetch(() => ({ data: {} }));
    const result = await createMotif({ falKey: "", fetch }).erase({
      image: IMAGE,
      prompt: "the car",
    });

    expect(result._unsafeUnwrapErr().code).toBe("MISSING_API_KEY");
    expect(calls).toHaveLength(0);
  });
});

describe("createMotif run", () => {
  it("runs a sync tool and splits files from data", async () => {
    const preview = "https://fal.media/files/preview.png";
    const objects = [{ x_max: 0.9, x_min: 0.1, y_max: 0.8, y_min: 0.2 }];
    const { calls, fetch } = fakeFetch(() => ({
      data: { image: { url: preview }, objects },
      requestId: "req-sync",
    }));
    const result = await client(fetch).ask({
      image: IMAGE,
      mode: "detect",
      prompt: "car",
    });

    const output = result._unsafeUnwrap();
    expect(calls[0]?.url).toBe(
      `https://fal.run/${FAL_TOOLS["moondream-detect"].endpoint}`
    );
    expect(calls[0]?.body).toStrictEqual({ image_url: IMAGE, prompt: "car" });
    expect(output.model).toBe("moondream-detect");
    expect(output.chosenBy).toBe("ranking");
    expect(output.files).toStrictEqual([{ key: "image", url: preview }]);
    expect(output.data).toStrictEqual({ objects });
    expect(output.requestId).toBe("req-sync");
  });

  it("runs a queued tool through submit, status and result", async () => {
    const endpoint = FAL_TOOLS["topaz-restore"].endpoint;
    const restored = "https://fal.media/files/restored.png";
    const statuses = [
      { queue_position: 2, status: "IN_QUEUE" },
      { status: "COMPLETED" },
    ];
    const { calls, fetch } = fakeFetch((call) => {
      if (call.method === "POST") {
        return {
          data: {
            request_id: "req-q",
            response_url: `https://queue.fal.run/${endpoint}/requests/req-q`,
          },
        };
      }
      if (call.url.includes("/status")) {
        return { data: statuses.shift() };
      }
      return { data: { image: { height: 1000, url: restored, width: 1000 } } };
    });
    const progress: [string, number | undefined][] = [];
    const result = await client(fetch).restore({
      ephemeral: true,
      image: IMAGE,
      onProgress: (status, position) => {
        progress.push([status, position]);
      },
    });

    const output = result._unsafeUnwrap();
    expect(calls[0]?.url).toBe(`https://queue.fal.run/${endpoint}`);
    expect(calls[0]?.headers["X-Fal-Store-IO"]).toBe("0");
    expect(progress).toStrictEqual([
      ["queued", 2],
      ["completed", undefined],
    ]);
    expect(output.files).toStrictEqual([{ key: "image", url: restored }]);
    expect(output.requestId).toBe("req-q");
    expect(output.cost).toStrictEqual({ basis: "measured", usd: 0.48 });
  }, 10_000);

  it("puts the rigged mesh first when a mesh run rigs", async () => {
    const endpoint = FAL_TOOLS["meshy-v7"].endpoint;
    const mesh = "https://fal.media/files/mesh.glb";
    const rigged = "https://fal.media/files/rigged.glb";
    const { fetch } = fakeFetch((call) => {
      if (call.method === "POST") {
        return {
          data: {
            request_id: "req-rig",
            response_url: `https://queue.fal.run/${endpoint}/requests/req-rig`,
          },
        };
      }
      if (call.url.includes("/status")) {
        return { data: { status: "COMPLETED" } };
      }
      return {
        data: {
          model_glb: { url: mesh },
          rigged_character_glb: { url: rigged },
        },
      };
    });
    const result = await client(fetch).mesh({ image: IMAGE, rig: true });

    const output = result._unsafeUnwrap();
    expect(output.files[0]).toStrictEqual({
      key: "rigged_character_glb",
      url: rigged,
    });
    expect(output.files[1]).toStrictEqual({ key: "model_glb", url: mesh });
  }, 10_000);

  it("merges params into a generation's sent body", async () => {
    const image = "https://fal.media/files/chair.png";
    const { calls, fetch } = fakeFetch(() => ({
      data: { images: [{ url: image }], seed: 7 },
    }));
    const result = await client(fetch).generate({
      model: "banana",
      params: { thinking_level: "high" },
      prompt: "a red chair",
    });

    const output = result._unsafeUnwrap();
    expect(calls[0]?.url).toBe(`https://fal.run/${MODELS.banana?.endpoint}`);
    expect(calls[0]?.body).toMatchObject({
      prompt: "a red chair",
      thinking_level: "high",
    });
    expect(output.files).toStrictEqual([{ key: "images", url: image }]);
    expect(output.data).toStrictEqual({ seed: 7 });
    expect(output.chosenBy).toBe("model");
  });
});

describe("createMotif OpenAI route", () => {
  it("sends a transparent GPT Image 2 request through the configured fetch", async () => {
    const png = "iVBORw0KGgoAAAANSUhEUg==";
    const { calls, fetch } = fakeFetch(() => ({
      data: { created: 1, data: [{ b64_json: png }] },
    }));
    const result = await createMotif({
      falKey: "test",
      fetch,
      openAiKey: "sk-test",
      retries: 0,
    }).generate({
      aspect: "3:2",
      model: "gpt2",
      prompt: "a logo",
      transparent: true,
    });

    const output = result._unsafeUnwrap();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/images/generations");
    expect(calls[0]?.body).toMatchObject({
      background: "transparent",
      model: "gpt-image-2",
      n: 1,
      output_format: "png",
      prompt: "a logo",
      size: "1536x1024",
    });
    expect(output.provider).toBe("openai");
    expect(output.files).toHaveLength(1);
    expect(output.files[0]?.url.startsWith("data:image/")).toBe(true);
  });
});

describe("createMotif functions", () => {
  it("has a named function for every Task", () => {
    const motif = client();
    // Compile-time: the client must be assignable to a function per TaskId.
    const functions: Record<TaskId, TaskFunction> = motif;

    for (const task of TASK_IDS) {
      expect(functions[task]).toBeTypeOf("function");
    }
  });
});
