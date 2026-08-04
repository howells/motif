import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { GENERATION_MODELS } from "@howells/motif-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  JudgeModelCallInput,
  JudgeModelClient,
  RoomJudgeLevels,
} from "./judge";
import {
  judgeSample,
  parseJudgeVerdictText,
  qualityLevelForScore,
  ROOM_RUBRIC_WEIGHTS,
  weightedGeometricMeanWithSlopGate,
} from "./judge";

const allLevels = (
  level: RoomJudgeLevels[keyof RoomJudgeLevels]
): RoomJudgeLevels => ({
  artifacts: level,
  lightingCoherence: level,
  materialFidelity: level,
  photorealism: level,
  promptAdherence: level,
  spatialPlausibility: level,
});

describe("weightedGeometricMeanWithSlopGate", () => {
  it("returns 4 when every criterion is editorial", () => {
    expect(
      weightedGeometricMeanWithSlopGate(
        allLevels("editorial"),
        ROOM_RUBRIC_WEIGHTS
      )
    ).toBeCloseTo(4, 5);
  });

  it("returns 1 when every criterion is stock", () => {
    expect(
      weightedGeometricMeanWithSlopGate(allLevels("stock"), ROOM_RUBRIC_WEIGHTS)
    ).toBeCloseTo(1, 5);
  });

  it("gates the overall score to 0 when any single criterion is slop, regardless of the rest", () => {
    const levels: RoomJudgeLevels = {
      ...allLevels("editorial"),
      artifacts: "slop",
    };
    expect(weightedGeometricMeanWithSlopGate(levels, ROOM_RUBRIC_WEIGHTS)).toBe(
      0
    );
  });

  it("weights promptAdherence/photorealism/artifacts above the other three", () => {
    const heavyGood: RoomJudgeLevels = {
      artifacts: "editorial",
      lightingCoherence: "stock",
      materialFidelity: "stock",
      photorealism: "editorial",
      promptAdherence: "editorial",
      spatialPlausibility: "stock",
    };
    const lightGood: RoomJudgeLevels = {
      artifacts: "stock",
      lightingCoherence: "editorial",
      materialFidelity: "editorial",
      photorealism: "stock",
      promptAdherence: "stock",
      spatialPlausibility: "editorial",
    };
    expect(
      weightedGeometricMeanWithSlopGate(heavyGood, ROOM_RUBRIC_WEIGHTS)
    ).toBeGreaterThan(
      weightedGeometricMeanWithSlopGate(lightGood, ROOM_RUBRIC_WEIGHTS)
    );
  });
});

describe("qualityLevelForScore", () => {
  it("buckets around the midpoints between the four scale values (0, 1, 3, 4)", () => {
    expect(qualityLevelForScore(0)).toBe("slop");
    expect(qualityLevelForScore(0.49)).toBe("slop");
    expect(qualityLevelForScore(0.5)).toBe("stock");
    expect(qualityLevelForScore(1.99)).toBe("stock");
    expect(qualityLevelForScore(2)).toBe("competent");
    expect(qualityLevelForScore(3.49)).toBe("competent");
    expect(qualityLevelForScore(3.5)).toBe("editorial");
    expect(qualityLevelForScore(4)).toBe("editorial");
  });
});

describe("parseJudgeVerdictText", () => {
  it("parses a clean JSON object", () => {
    const verdict = parseJudgeVerdictText(
      JSON.stringify({
        artifacts: "editorial",
        critique: "Clean render.",
        lightingCoherence: "editorial",
        materialFidelity: "editorial",
        photorealism: "editorial",
        promptAdherence: "editorial",
        spatialPlausibility: "editorial",
      })
    );
    expect(verdict).toEqual({
      critique: "Clean render.",
      levels: {
        artifacts: "editorial",
        lightingCoherence: "editorial",
        materialFidelity: "editorial",
        photorealism: "editorial",
        promptAdherence: "editorial",
        spatialPlausibility: "editorial",
      },
    });
  });

  it("strips a markdown fence and a preamble before the JSON object", () => {
    const verdict = parseJudgeVerdictText(
      `Sure, here is my assessment:\n\`\`\`json\n${JSON.stringify({
        artifacts: "stock",
        critique: "Fine.",
        lightingCoherence: "stock",
        materialFidelity: "stock",
        photorealism: "stock",
        promptAdherence: "stock",
        spatialPlausibility: "stock",
      })}\n\`\`\``
    );
    expect(verdict?.levels.artifacts).toBe("stock");
    expect(verdict?.critique).toBe("Fine.");
  });

  it("normalizes case and synonyms for level words", () => {
    const verdict = parseJudgeVerdictText(
      JSON.stringify({
        artifacts: "EXCELLENT",
        critique: "ok",
        lightingCoherence: "Good",
        materialFidelity: "Generic",
        photorealism: "BAD",
        promptAdherence: "editorial",
        spatialPlausibility: "totally failed",
      })
    );
    expect(verdict?.levels).toEqual({
      artifacts: "editorial",
      lightingCoherence: "competent",
      materialFidelity: "stock",
      photorealism: "slop",
      promptAdherence: "editorial",
      spatialPlausibility: "slop",
    });
  });

  it("falls back to stock (not editorial) for a missing or unrecognizable field, never failing on formatting", () => {
    const verdict = parseJudgeVerdictText(
      JSON.stringify({ promptAdherence: "purple" })
    );
    expect(verdict).not.toBeNull();
    expect(verdict?.levels.promptAdherence).toBe("stock");
    expect(verdict?.levels.artifacts).toBe("stock");
    expect(verdict?.critique).toBe("No critique provided by the judge model.");
  });

  it("returns null only when no JSON object can be found at all", () => {
    expect(parseJudgeVerdictText("I refuse to answer.")).toBeNull();
    expect(parseJudgeVerdictText("")).toBeNull();
  });
});

const minimalPngBytes = (): Buffer => {
  const png = Buffer.alloc(24);
  for (const [index, byte] of [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ].entries()) {
    png[index] = byte;
  }
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(64, 16);
  png.writeUInt32BE(48, 20);
  return png;
};

const wellFormedVerdictText = JSON.stringify({
  artifacts: "competent",
  critique: "Plausible room, minor lighting inconsistency.",
  lightingCoherence: "competent",
  materialFidelity: "competent",
  photorealism: "competent",
  promptAdherence: "editorial",
  spatialPlausibility: "competent",
});

describe("judgeSample", () => {
  let tempDir: string;
  let imagePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "bench-judge-test-"));
    imagePath = path.join(tempDir, "sample.png");
    await writeFile(imagePath, minimalPngBytes());
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("scores a well-formed response and reports the raw Buffer to the client — never a base64 string or data URI", async () => {
    const captured: JudgeModelCallInput[] = [];
    const client: JudgeModelClient = {
      // oxlint-disable-next-line require-await -- the mock's body is synchronous by design (no network, no timers)
      generateJudgeText: async (input) => {
        captured.push(input);
        return wellFormedVerdictText;
      },
    };

    const result = await judgeSample(client, {
      imagePath,
      prompt: "A well-lit modern living room with a gray sofa.",
    });

    expect(result.status).toBe("scored");
    if (result.status !== "scored") {
      return;
    }
    expect(result.levels.promptAdherence).toBe("editorial");
    expect(result.overall).toBeGreaterThan(0);
    expect(result.rubricId).toBe("bench-room-v1");
    expect(result.rubricVersion).toBe(1);

    const call = captured[0];
    expect(call).toBeDefined();
    if (!call) {
      return;
    }
    expect(call.imagePart.type).toBe("file");
    // The base64 rule: raw bytes, not a base64-encoded string, not a data URI.
    expect(Buffer.isBuffer(call.imagePart.data)).toBe(true);
    expect(typeof call.imagePart.data).not.toBe("string");
  });

  it("never reveals which generation model produced the image — no alias appears in the prompt handed to the client", async () => {
    const captured: JudgeModelCallInput[] = [];
    const client: JudgeModelClient = {
      // oxlint-disable-next-line require-await -- the mock's body is synchronous by design (no network, no timers)
      generateJudgeText: async (input) => {
        captured.push(input);
        return wellFormedVerdictText;
      },
    };

    await judgeSample(client, {
      imagePath,
      prompt: "A minimalist kitchen with matte black hardware.",
    });

    const call = captured[0];
    expect(call).toBeDefined();
    if (!call) {
      return;
    }
    const promptText = call.prompt;
    for (const alias of GENERATION_MODELS) {
      expect(promptText.toLowerCase()).not.toContain(alias.toLowerCase());
    }
    // Nor does it carry a data URI / long base64 payload — the image travels
    // as a separate FilePart, never inlined into prompt text.
    expect(promptText).not.toMatch(/data:[^,]+;base64,/iu);
  });

  it("is inconclusive with IMAGE_READ_FAILED when the image cannot be read, never throwing", async () => {
    const client: JudgeModelClient = {
      // oxlint-disable-next-line require-await -- unused in this branch; must still return a Promise to satisfy JudgeModelClient
      generateJudgeText: async () => {
        throw new Error("should never be called");
      },
    };

    const result = await judgeSample(client, {
      imagePath: path.join(tempDir, "does-not-exist.png"),
      prompt: "irrelevant",
    });

    expect(result).toEqual({
      errorCode: "IMAGE_READ_FAILED",
      status: "inconclusive",
    });
  });

  it("is inconclusive with JUDGE_UNAVAILABLE when the client throws", async () => {
    const client: JudgeModelClient = {
      // oxlint-disable-next-line require-await -- the mock's failure is synchronous by design
      generateJudgeText: async () => {
        throw new Error("upstream 500");
      },
    };

    const result = await judgeSample(client, { imagePath, prompt: "a room" });

    expect(result).toEqual({
      errorCode: "JUDGE_UNAVAILABLE",
      status: "inconclusive",
    });
  });

  it("is inconclusive with TIMEOUT when the client aborts", async () => {
    const client: JudgeModelClient = {
      // oxlint-disable-next-line require-await -- the mock's failure is synchronous by design
      generateJudgeText: async () => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        throw error;
      },
    };

    const result = await judgeSample(client, { imagePath, prompt: "a room" });

    expect(result).toEqual({ errorCode: "TIMEOUT", status: "inconclusive" });
  });

  it("is inconclusive with INVALID_VERDICT when the client's text has no JSON object at all", async () => {
    const client: JudgeModelClient = {
      // oxlint-disable-next-line require-await -- the mock's body is synchronous by design (no network, no timers)
      generateJudgeText: async () => "I cannot help with that.",
    };

    const result = await judgeSample(client, { imagePath, prompt: "a room" });

    expect(result).toEqual({
      errorCode: "INVALID_VERDICT",
      status: "inconclusive",
    });
  });

  it("gates a scored result to overall 0 when the client reports any criterion as slop", async () => {
    const client: JudgeModelClient = {
      // oxlint-disable-next-line require-await -- the mock's body is synchronous by design (no network, no timers)
      generateJudgeText: async () =>
        JSON.stringify({
          artifacts: "slop",
          critique: "Garbled hands on the armchair.",
          lightingCoherence: "editorial",
          materialFidelity: "editorial",
          photorealism: "editorial",
          promptAdherence: "editorial",
          spatialPlausibility: "editorial",
        }),
    };

    const result = await judgeSample(client, { imagePath, prompt: "a room" });

    expect(result.status).toBe("scored");
    if (result.status !== "scored") {
      return;
    }
    expect(result.overall).toBe(0);
    expect(result.overallLevel).toBe("slop");
  });
});
