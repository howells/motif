/**
 * Unit tests for `live-engine.ts`'s pure/constructor-level surface.
 * `createLiveEngine()`'s `FAL_KEY` guard throws before any fal or
 * vision-model call happens; `bufferFromFilePartData`,
 * `buildFalVisionRequestBody`, and `parseFalVisionOutput` are pure functions
 * with no I/O of their own. `buildFalJudgeModelClient`'s one test that
 * exercises its full flow stubs both `FalClient.prototype.uploadToFalCdn`
 * and `globalThis.fetch` — no live fal call is ever made.
 */
import { err, FalClient, MotifError, ok } from "@howells/motif-sdk";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  bufferFromFilePartData,
  buildFalJudgeModelClient,
  buildFalPairJudgeModelClient,
  buildFalVisionPairRequestBody,
  buildFalVisionRequestBody,
  createFalGenerationClient,
  createLiveEngine,
  FAL_JUDGE_MODEL_ID,
  FAL_RANK_JUDGE_MODEL_ID,
  JUDGE_IMAGE_JPEG_QUALITY,
  JUDGE_IMAGE_LONG_EDGE,
  LIVE_GENERATION_TIMEOUT_FLOOR_SECONDS,
  normalizeJudgeImageForUpload,
  parseFalVisionOutput,
  timeoutMsForAlias,
} from "./live-engine";
import { mockRunEngine } from "./mock-engine";

/** A real, tiny, decodable PNG — `sharp` (used both by the code under test
 * and here) refuses the old 4-byte magic-number-only fixture outright
 * ("Input buffer contains unsupported image format"), so every test that
 * exercises the judge-image normalization path needs actual pixel data. */
const tinyPng = async (width: number, height: number): Promise<Buffer> =>
  await sharp({
    create: {
      background: { b: 30, g: 20, r: 10 },
      channels: 3,
      height,
      width,
    },
  })
    .png()
    .toBuffer();

describe("timeoutMsForAlias", () => {
  it("computes p95Seconds × 1.5 for a model with published speed data", () => {
    // grok-image: benchmark.speed.p95Seconds = 6.5 (packages/motif-sdk/src/models.ts)
    expect(timeoutMsForAlias("grok-image")).toBe(Math.round(6.5 * 1.5 * 1000));
  });

  it("falls back to the named floor for a model with no published p95Seconds", () => {
    // flux-fast: one of the 12 of 23 models with no benchmark.speed.p95Seconds
    // (docs/arc/bench/BRIEF.md, "verified ground truth").
    expect(timeoutMsForAlias("flux-fast")).toBe(
      Math.round(LIVE_GENERATION_TIMEOUT_FLOOR_SECONDS * 1.5 * 1000)
    );
  });
});

describe("createFalGenerationClient", () => {
  it("cannot be constructed without an API key", () => {
    expect(() =>
      createFalGenerationClient({ apiKey: "", timeoutMs: 1000 })
    ).toThrow(/api key/iu);
  });
});

describe("createLiveEngine", () => {
  const originalFalKey = process.env.FAL_KEY;

  afterEach(() => {
    if (originalFalKey === undefined) {
      delete process.env.FAL_KEY;
    } else {
      process.env.FAL_KEY = originalFalKey;
    }
  });

  it("cannot be constructed without FAL_KEY", () => {
    expect(() => createLiveEngine({} as NodeJS.ProcessEnv)).toThrow(
      /requires FAL_KEY/
    );
  });

  it("cannot be constructed with an empty-string FAL_KEY", () => {
    expect(() =>
      createLiveEngine({ FAL_KEY: "" } as NodeJS.ProcessEnv)
    ).toThrow(/requires FAL_KEY/);
  });

  it("constructs successfully, flagged isMock: false, once FAL_KEY is present", () => {
    process.env.FAL_KEY = "fal_test_key";
    const engine = createLiveEngine();
    expect(engine.isMock).toBe(false);
    expect(engine.judgeModelLabel).toBe(FAL_JUDGE_MODEL_ID);
  });
});

describe("bufferFromFilePartData — the base64/data-URI rule, narrowing side", () => {
  it("passes a Buffer through unchanged (same instance, never re-encoded)", () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(bufferFromFilePartData(data)).toBe(data);
  });

  it("converts a Uint8Array to a Buffer", () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = bufferFromFilePartData(data);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...result]).toEqual([1, 2, 3]);
  });

  it("converts an ArrayBuffer to a Buffer", () => {
    const data = new Uint8Array([4, 5, 6]).buffer;
    const result = bufferFromFilePartData(data);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...result]).toEqual([4, 5, 6]);
  });

  it("refuses a string — the last line of defense against a base64/data URI reaching fal", () => {
    expect(() =>
      bufferFromFilePartData("data:image/png;base64,iVBORw0KGgo=")
    ).toThrow(/base64|buffer|binary/iu);
  });
});

describe("buildFalVisionRequestBody — the verified fal any-llm/vision contract", () => {
  it("matches the exact shape confirmed live: prompt, image_url, model", () => {
    const body = buildFalVisionRequestBody(
      "judge this room image",
      "https://fal.media/files/panda/judge-sample.png"
    );
    expect(body).toEqual({
      image_url: "https://fal.media/files/panda/judge-sample.png",
      model: FAL_JUDGE_MODEL_ID,
      prompt: "judge this room image",
    });
  });

  it("never embeds a base64 string or a data: URI — image_url is always a fal CDN URL", () => {
    const body = buildFalVisionRequestBody(
      "judge this room image",
      "https://fal.media/files/panda/judge-sample.png"
    );
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/data:[^,"]+;base64,/iu);
    expect(serialized).not.toMatch(/"[A-Za-z0-9+/]{200,}={0,2}"/u);
  });
});

describe("parseFalVisionOutput", () => {
  it("returns the output string on a clean success response", () => {
    expect(parseFalVisionOutput({ output: "Elephant" })).toBe("Elephant");
  });

  it("throws when output is missing", () => {
    expect(() =>
      parseFalVisionOutput({ reasoning: "no output field" })
    ).toThrow(/output/iu);
  });

  it("throws when output is blank", () => {
    expect(() => parseFalVisionOutput({ output: "   " })).toThrow(/output/iu);
  });

  it("throws when fal reports a truthy error", () => {
    expect(() =>
      parseFalVisionOutput({ error: "model unavailable", output: "" })
    ).toThrow(/error/iu);
  });

  it("throws on a non-object response", () => {
    expect(() => parseFalVisionOutput(null)).toThrow(/non-object/iu);
    expect(() => parseFalVisionOutput("Elephant")).toThrow(/non-object/iu);
  });
});

describe("normalizeJudgeImageForUpload — the uniform-payload fix", () => {
  it("downscales an oversized image to a 1024px long edge, never more", async () => {
    // Deliberately larger than seedream45's real 4096×4096 in the sweep this
    // exists to fix, kept small here only so the test runs fast.
    const oversized = await tinyPng(2200, 1400);
    const { bytes, mediaType } = await normalizeJudgeImageForUpload(oversized);
    const metadata = await sharp(bytes).metadata();

    expect(mediaType).toBe("image/jpeg");
    expect(metadata.format).toBe("jpeg");
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(
      JUDGE_IMAGE_LONG_EDGE
    );
    // Aspect ratio preserved: 2200x1400 -> long edge 1024 means the short
    // edge scales to 1024 * (1400/2200), rounded.
    expect(metadata.width).toBe(JUDGE_IMAGE_LONG_EDGE);
    expect(metadata.height).toBe(Math.round(1024 * (1400 / 2200)));
  });

  it("never upscales an image already smaller than the target long edge", async () => {
    const small = await tinyPng(200, 150);
    const { bytes } = await normalizeJudgeImageForUpload(small);
    const metadata = await sharp(bytes).metadata();

    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(150);
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThan(
      JUDGE_IMAGE_LONG_EDGE
    );
  });

  it("re-encodes as JPEG at the named quality regardless of source format", async () => {
    const png = await tinyPng(64, 64);
    const { mediaType } = await normalizeJudgeImageForUpload(png);
    expect(mediaType).toBe("image/jpeg");
    // Not asserting an exact byte count (JPEG encoders are not that
    // deterministic across environments) — just that the quality constant is
    // the one actually threaded through, not a different hardcoded number.
    expect(JUDGE_IMAGE_JPEG_QUALITY).toBe(85);
  });

  it("operates on Buffers, never a base64 string or a data: URI", async () => {
    const png = await tinyPng(10, 10);
    expect(Buffer.isBuffer(png)).toBe(true);
    const { bytes } = await normalizeJudgeImageForUpload(png);
    expect(Buffer.isBuffer(bytes)).toBe(true);
  });
});

describe("buildFalJudgeModelClient — full flow, network stubbed", () => {
  let imagePart: { data: Buffer; mediaType: string; type: "file" };

  beforeAll(async () => {
    imagePart = {
      data: await tinyPng(4, 4),
      mediaType: "image/png",
      type: "file",
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes the Buffer (resized, re-encoded JPEG) before uploading to fal's CDN, then POSTs the returned URL — never a base64/data URI, and no live fal call", async () => {
    const uploadSpy = vi
      .spyOn(FalClient.prototype, "uploadToFalCdn")
      .mockResolvedValue(ok("https://fal.media/files/panda/judge-sample.png"));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ output: "Elephant" }), { status: 200 })
      );

    const client = buildFalJudgeModelClient("fal_test_key");
    const output = await client.generateJudgeText({
      imagePart,
      prompt: "judge this room image",
    });

    expect(output).toBe("Elephant");

    expect(uploadSpy).toHaveBeenCalledTimes(1);
    const [uploadedBytes, uploadOptions] = uploadSpy.mock.calls[0] ?? [];
    if (!Buffer.isBuffer(uploadedBytes)) {
      throw new TypeError("expected the upload call to carry a Buffer");
    }
    // Never the raw input bytes unchanged — every judge image is normalized
    // (downscaled/re-encoded) before it leaves this function.
    expect(uploadedBytes).not.toBe(imagePart.data);
    expect(uploadOptions?.contentType).toBe("image/jpeg");
    const metadata = await sharp(uploadedBytes).metadata();
    expect(metadata.format).toBe("jpeg");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchSpy.mock.calls[0] ?? [];
    if (typeof url !== "string") {
      throw new TypeError("expected the vision judge call to use a string URL");
    }
    expect(url).toBe("https://fal.run/fal-ai/any-llm/vision");
    const body = requestInit?.body;
    if (typeof body !== "string") {
      throw new TypeError("expected a JSON string request body");
    }
    expect(body).toContain("https://fal.media/files/panda/judge-sample.png");
    expect(body).not.toMatch(/data:[^,"]+;base64,/iu);
    expect(body).not.toMatch(/"[A-Za-z0-9+/]{200,}={0,2}"/u);
  });

  it("throws (never crashes the caller silently) when the CDN upload fails", async () => {
    vi.spyOn(FalClient.prototype, "uploadToFalCdn").mockResolvedValue(
      err(new MotifError("upload failed", 500))
    );

    const client = buildFalJudgeModelClient("fal_test_key");
    await expect(
      client.generateJudgeText({ imagePart, prompt: "judge this room image" })
    ).rejects.toThrow(/upload/iu);
  });
});

const PAIR_URL_A = "https://fal.media/files/panda/a.png";
const PAIR_URL_B = "https://fal.media/files/panda/b.png";

describe("buildFalVisionPairRequestBody", () => {
  it("carries both CDN URLs in image_urls (plural), A first", () => {
    const body = buildFalVisionPairRequestBody(
      "compare these",
      PAIR_URL_A,
      PAIR_URL_B
    );
    expect(body.image_urls).toStrictEqual([PAIR_URL_A, PAIR_URL_B]);
    expect(body.model).toBe(FAL_RANK_JUDGE_MODEL_ID);
  });

  it("uses a stronger judge tier than the absolute pass", () => {
    expect(FAL_RANK_JUDGE_MODEL_ID).toBe("google/gemini-2.5-flash");
    expect(FAL_RANK_JUDGE_MODEL_ID).not.toBe(FAL_JUDGE_MODEL_ID);
  });

  it("never inlines image bytes as base64 or a data URI", () => {
    const serialized = JSON.stringify(
      buildFalVisionPairRequestBody("compare these", PAIR_URL_A, PAIR_URL_B)
    );
    expect(serialized).not.toMatch(/data:[^,"]+;base64,/iu);
    expect(serialized).not.toMatch(/"[A-Za-z0-9+/]{200,}={0,2}"/u);
  });
});

describe("buildFalPairJudgeModelClient — full flow, network stubbed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs one request carrying both URLs — one provider call per pair, no upload, no live fal call", async () => {
    const uploadSpy = vi.spyOn(FalClient.prototype, "uploadToFalCdn");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ output: '{"overall":"A"}' }), {
        status: 200,
      })
    );

    const output = await buildFalPairJudgeModelClient(
      "fal_test_key"
    ).generatePairJudgeText({
      imageUrlA: PAIR_URL_A,
      imageUrlB: PAIR_URL_B,
      prompt: "compare these two rooms",
    });

    expect(output).toBe('{"overall":"A"}');
    // The pair client never re-uploads: the driver uploads each sample once
    // and reuses the URL across every comparison it appears in.
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, requestInit] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://fal.run/fal-ai/any-llm/vision");
    const body = requestInit?.body;
    if (typeof body !== "string") {
      throw new TypeError("expected a JSON string request body");
    }
    expect(body).toContain(PAIR_URL_A);
    expect(body).toContain(PAIR_URL_B);
    expect(body).toContain("image_urls");
    expect(body).not.toMatch(/data:[^,"]+;base64,/iu);
  });

  it("throws on a non-200 so judgePair can report it as inconclusive", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 503 })
    );

    await expect(
      buildFalPairJudgeModelClient("fal_test_key").generatePairJudgeText({
        imageUrlA: PAIR_URL_A,
        imageUrlB: PAIR_URL_B,
        prompt: "compare these two rooms",
      })
    ).rejects.toThrow(/503/u);
  });
});

describe("comparativeJudge — the engine seam", () => {
  const originalFalKey = process.env.FAL_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFalKey === undefined) {
      delete process.env.FAL_KEY;
    } else {
      process.env.FAL_KEY = originalFalKey;
    }
  });

  it("is present on the live engine and labelled with the rank judge model", () => {
    process.env.FAL_KEY = "fal_test_key";
    expect(createLiveEngine().comparativeJudge?.modelLabel).toBe(
      FAL_RANK_JUDGE_MODEL_ID
    );
  });

  it("is null on the mock engine — nothing on disk to compare", () => {
    expect(mockRunEngine.comparativeJudge).toBeNull();
  });
});
