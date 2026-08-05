import { alignParams } from "@motif/bench-core";
import { describe, expect, it } from "vitest";

import {
  mockGenerationExecutor,
  mockJudgeExecutor,
  mockJudgmentPersistExecutor,
  mockPersistExecutor,
  mockSampleLoaderExecutor,
} from "./executors";

describe("mockGenerationExecutor", () => {
  it("resolves ok, never touching the network or filesystem", async () => {
    const controller = new AbortController();
    const alignment = alignParams(
      "flux-fast",
      {
        aspect: "1:1",
        outputFormat: null,
        prompt: "a cat",
        resolution: "1K",
        seed: 7,
      },
      0
    );
    expect(alignment.ok).toBe(true);
    if (!alignment.ok) {
      return;
    }

    const result = await mockGenerationExecutor.execute({
      alignment,
      imagePath: "run/flux-fast/0",
      signal: controller.signal,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.seedReturned).toBe(alignment.seedSent);
    expect(result.imagePath).toBe("run/flux-fast/0");
  });
});

describe("mockPersistExecutor", () => {
  it("returns a deterministic id derived from the sample's coordinates", async () => {
    const persisted = await mockPersistExecutor.persist({
      alias: "flux-fast",
      costBasis: "images",
      costEstimatedMicros: 3000,
      executionOrdinal: 0,
      modelName: "Flux Fast",
      result: {
        downloadMs: null,
        errorCode: "TIMEOUT",
        ok: false,
        providerMs: null,
        totalMs: 1,
      },
      runId: "run-1",
      sampleIndex: 2,
      usesQueue: false,
    });

    expect(persisted.sampleId).toBe("mock-run-1-flux-fast-2");
  });
});

describe("mockSampleLoaderExecutor", () => {
  it("resolves without touching the network or a database", async () => {
    const samples = await mockSampleLoaderExecutor.loadSamples("run-1");

    expect(samples).toHaveLength(1);
    expect(samples[0]?.sampleId).toContain("run-1");
    expect(samples[0]?.imagePath.length).toBeGreaterThan(0);
    expect(samples[0]?.prompt.length).toBeGreaterThan(0);
  });
});

describe("mockJudgeExecutor", () => {
  it("resolves a deterministic scored judgment without a vision model call", async () => {
    const result = await mockJudgeExecutor.judge({
      imagePath: "/tmp/does-not-matter.png",
      prompt: "a room",
    });

    expect(result).toEqual({
      critique: "Mock judge: plausible composition, no obvious defects.",
      levels: {
        artifacts: "competent",
        lightingCoherence: "competent",
        materialFidelity: "competent",
        photorealism: "competent",
        promptAdherence: "competent",
        spatialPlausibility: "competent",
      },
      overall: 3,
      overallLevel: "competent",
      rubricId: "bench-room-v1",
      rubricVersion: 1,
      status: "scored",
    });
  });
});

describe("mockJudgmentPersistExecutor", () => {
  it("returns a deterministic id derived from the sample's coordinates", async () => {
    const persisted = await mockJudgmentPersistExecutor.persistJudgment({
      critique: "fine",
      errorCode: null,
      judgeModel: "mock-judge",
      levels: null,
      overall: 3,
      rubricId: "bench-room-v1",
      rubricVersion: 1,
      sampleId: "sample-42",
      status: "scored",
    });

    expect(persisted.judgmentId).toBe("mock-judgment-sample-42");
  });
});
