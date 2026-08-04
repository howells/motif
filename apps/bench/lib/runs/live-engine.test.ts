/**
 * Unit tests for `live-engine.ts`'s pure/constructor-level surface. Nothing
 * here makes a network call — `createLiveEngine()`'s `FAL_KEY` guard throws
 * before any fal or vision-model call happens, and `buildJudgeMessages` is a
 * pure message-shaping function with no I/O of its own.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  buildJudgeMessages,
  createFalGenerationClient,
  createLiveEngine,
  LIVE_GENERATION_TIMEOUT_FLOOR_SECONDS,
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
  });
});

describe("buildJudgeMessages — the base64/data-URI rule", () => {
  const imagePart = {
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    mediaType: "image/png",
    type: "file" as const,
  };

  it("forwards the FilePart's data as the same Buffer instance, never re-encoding it", () => {
    const messages = buildJudgeMessages(imagePart, "judge this room image");
    const [message] = messages;
    expect(message?.role).toBe("user");
    const content = message?.content;
    if (!Array.isArray(content)) {
      throw new TypeError("expected an array content payload");
    }
    const filePart = content.find(
      (part): part is typeof imagePart =>
        typeof part === "object" && part !== null && "data" in part
    );
    expect(filePart).toBeDefined();
    expect(Buffer.isBuffer(filePart?.data)).toBe(true);
    expect(filePart?.data).toBe(imagePart.data);
  });

  it("never produces a base64 string or a data: URI anywhere in the message payload", () => {
    const messages = buildJudgeMessages(imagePart, "judge this room image");
    // JSON.stringify on a Buffer serializes it as {type:"Buffer",data:[...]}
    // (a numeric byte array), not a base64 string — this assertion fails
    // loudly if a future change swaps the Buffer for a base64-encoded string
    // or a `data:` URI anywhere in the payload.
    const serialized = JSON.stringify(messages);
    expect(serialized).not.toMatch(/data:[^,"]+;base64,/iu);
    expect(serialized).not.toMatch(/"[A-Za-z0-9+/]{200,}={0,2}"/u);
  });
});
