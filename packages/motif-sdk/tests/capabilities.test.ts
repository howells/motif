import { describe, expect, it } from "vitest";

import {
  buildGenerateBody,
  MODELS,
  modelsSupporting,
  supportedOptions,
  UnsupportedOptionError,
} from "../src/index";

function refusal(run: () => unknown): UnsupportedOptionError {
  try {
    run();
  } catch (error) {
    if (error instanceof UnsupportedOptionError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected an UnsupportedOptionError");
}

describe("unsupported option errors", () => {
  it("name the models that support the option and what this model supports", () => {
    const error = refusal(() =>
      buildGenerateBody({
        model: "seedream45",
        prompt: "a lighthouse",
        resolution: "4K",
      })
    );

    expect(error.code).toBe("INVALID_OPTION");
    expect(error.option).toBe("resolution");
    expect(error.model).toBe(MODELS.seedream45?.name);
    expect(error.modelsSupporting).toContain("banana");
    expect(error.modelsSupporting).not.toContain("seedream45");
    expect(error.message).toMatch(
      /^Seedream 4\.5 does not support resolution\. Models that do: .*banana/
    );
    expect(error.message).toContain("Seedream 4.5 supports: ");
  });

  it("derive both lists from the registry", () => {
    for (const id of modelsSupporting("resolution")) {
      expect(MODELS[id]?.supportsResolution).toBeTruthy();
    }
    const gpt = MODELS.gpt;
    expect(gpt).toBeDefined();
    if (gpt !== undefined) {
      expect(supportedOptions(gpt)).toContain("transparent output");
    }
  });

  it("point gpt2 transparency at its OpenAI route", () => {
    const error = refusal(() =>
      buildGenerateBody({
        model: "gpt2",
        prompt: "a sticker",
        transparent: true,
      })
    );
    expect(error.option).toBe("transparent output");
    expect(error.modelsSupporting).toContain("gpt");
    expect(error.message).toContain("OPENAI_API_KEY");
  });
});
