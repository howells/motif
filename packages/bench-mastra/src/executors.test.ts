import { alignParams } from "@motif/bench-core";
import { describe, expect, it } from "vitest";

import { mockGenerationExecutor, mockPersistExecutor } from "./executors";

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
