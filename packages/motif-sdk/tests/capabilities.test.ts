import { describe, expect, it } from "vitest";

import { modelsSupporting, UnsupportedOptionError } from "../src/capabilities";
import { buildGenerateBody } from "../src/generate";
import { MODELS } from "../src/models";

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
    expect(error.modelsSupporting).not.toContain("seedream45");
  });

  it("derives the supporting models from the registry", () => {
    for (const id of modelsSupporting("resolution")) {
      expect(MODELS[id]?.supportsResolution).toBe(true);
    }
  });
});
