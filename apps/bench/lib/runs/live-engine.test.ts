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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bufferFromFilePartData,
  buildFalJudgeModelClient,
  buildFalVisionRequestBody,
  createFalGenerationClient,
  createLiveEngine,
  FAL_JUDGE_MODEL_ID,
  LIVE_GENERATION_TIMEOUT_FLOOR_SECONDS,
  parseFalVisionOutput,
  timeoutMsForAlias,
} from "./live-engine";

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
    delete process.env.FAL_KEY;
    expect(() => createLiveEngine()).toThrow(/FAL_KEY/u);
  });

  it("cannot be constructed with an empty-string FAL_KEY", () => {
    process.env.FAL_KEY = "";
    expect(() => createLiveEngine()).toThrow(/FAL_KEY/u);
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

describe("buildFalJudgeModelClient — full flow, network stubbed", () => {
  const imagePart = {
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    mediaType: "image/png",
    type: "file" as const,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads the raw Buffer to fal's CDN via uploadToFalCdn, then POSTs the returned URL — never a base64/data URI, and no live fal call", async () => {
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
    const [uploadedBytes] = uploadSpy.mock.calls[0] ?? [];
    expect(uploadedBytes).toBe(imagePart.data);

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
