import { describe, expect, it } from "vitest";

import { FalClient, MotifError } from "../src/index";

describe("FalClient builder-error contract", () => {
  const motif = new FalClient({ apiKey: "test-key" });

  it("generate resolves with an err() for unknown creative option ids", async () => {
    const result = await motif.generate({
      creative: { mood: "not-a-real-id" },
      model: "banana",
      prompt: "x",
    });

    expect(result.isErr()).toBeTruthy();
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      expect(result.error.code).toBe("INVALID_OPTION");
      expect(result.error.message).toContain("Unknown creative mood");
    }
  });

  it("submitGeneration resolves with an err() for unknown creative option ids", async () => {
    const result = await motif.submitGeneration({
      creative: { mood: "not-a-real-id" },
      model: "banana",
      prompt: "x",
    });

    expect(result.isErr()).toBeTruthy();
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      expect(result.error.code).toBe("INVALID_OPTION");
      expect(result.error.message).toContain("Unknown creative mood");
    }
  });

  it("generate resolves with an err() for an unknown model", async () => {
    const result = await motif.generate({
      model: "nope",
      prompt: "x",
    });

    expect(result.isErr()).toBeTruthy();
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      expect(result.error.message).toContain("Unknown model: nope");
    }
  });

  it("generate resolves with an err() for an option the model does not support", async () => {
    const result = await motif.generate({
      model: "flux-fast",
      prompt: "simple product render",
      quality: "high",
    });

    expect(result.isErr()).toBeTruthy();
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      expect(result.error.message).toContain(
        "FLUX Schnell does not support quality"
      );
    }
  });
});
