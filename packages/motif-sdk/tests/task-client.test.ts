import { describe, expect, it } from "vitest";

import {
  createMotif,
  FAL_TOOLS,
  MODELS,
  NO_MODEL_AVAILABLE,
  TASK_IDS,
} from "../src/index";
import type {
  FalFetch,
  MotifClient,
  TaskFunction,
  TaskId,
  TaskInput,
} from "../src/index";

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
      tile: { prompt: "terracotta tiles" },
    };
    const input: TaskInput = {
      ...(task === "generate" ? {} : { image: IMAGE }),
      ...needs[task],
    };
    // An empty key reads as no key, and never falls back to FAL_KEY.
    const motif = createMotif({ falKey: "", fetch: noNetwork.fetch });
    const result = motif.plan(task, input, { dryRun: true });

    expect(result.isOk()).toBeTruthy();
    const plan = result._unsafeUnwrap();
    expect(plan.task).toBe(task);
    expect(plan.endpoint).not.toBe("");
    expect(Object.keys(plan.body).length).toBeGreaterThan(0);
    expect(noNetwork.calls).toHaveLength(0);
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

  it("queues animate and sends the image as start_image_url", () => {
    const plan = planned("animate", { image: IMAGE, prompt: "slow pan" });

    expect(plan.model).toBe("kling");
    expect(plan.queued).toBeTruthy();
    expect(plan.body).toMatchObject({
      duration: "5",
      prompt: "slow pan",
      start_image_url: IMAGE,
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

  it("maps a generation option the Model refuses to its field", () => {
    const error = refused("generate", {
      model: "flux2-pro",
      prompt: "a chair",
      resolution: "4K",
    });

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.details).toStrictEqual({
      field: "resolution",
      model: "flux2-pro",
      task: "generate",
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
    expect(output.cost).toStrictEqual({ basis: "measured", usd: 0.02 });
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
    expect(output.files[0]?.url.startsWith("data:image/")).toBeTruthy();
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
