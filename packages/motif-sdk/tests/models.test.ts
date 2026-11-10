import { describe, expect, it } from "vitest";

import { EDIT_CAPABLE_MODELS, GENERATION_MODELS, MODELS } from "../src/models";

describe("EDIT_CAPABLE_MODELS", () => {
  it("includes exactly the generation models whose config supports editing", () => {
    for (const id of GENERATION_MODELS) {
      expect(EDIT_CAPABLE_MODELS.includes(id)).toBe(
        Boolean(MODELS[id]?.supportsEdit)
      );
    }
  });
});
