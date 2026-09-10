import { CREATIVE_FIELDS } from "@howells/motif-sdk";
import { describe, expect, it } from "vitest";

import { resolveCreativeDirection } from "../src/utils/creative";

describe(resolveCreativeDirection, () => {
  it("prefers flag values over base values per field", () => {
    const result = resolveCreativeDirection(
      { look: "flag-look" },
      { look: "base-look", mood: "base-mood" }
    );

    expect(result).toStrictEqual({
      look: "flag-look",
      mood: "base-mood",
    });
  });

  it("fills fields the flags omit from the base", () => {
    const result = resolveCreativeDirection(
      {},
      { look: "lived-in", mood: "overcast" }
    );

    expect(result).toStrictEqual({ look: "lived-in", mood: "overcast" });
  });

  it("drops a field for a false flag or a null value, even over a base", () => {
    expect(
      resolveCreativeDirection(
        { mood: false },
        { look: "plate", mood: "overcast" }
      )
    ).toStrictEqual({ look: "plate" });
    expect(
      resolveCreativeDirection({}, { look: "plate", mood: null })
    ).toStrictEqual({ look: "plate" });
    expect(resolveCreativeDirection({ mood: false })).toBeUndefined();
  });

  it("returns undefined when both flags and base are empty", () => {
    expect(resolveCreativeDirection({})).toBeUndefined();
    expect(resolveCreativeDirection({}, {})).toBeUndefined();
  });

  it("ignores option keys that are not creative fields", () => {
    const flags: Record<string, string> = { style: "free-text style prompt" };
    expect(resolveCreativeDirection(flags)).toBeUndefined();
  });

  it("honors every field in CREATIVE_FIELDS", () => {
    for (const field of CREATIVE_FIELDS) {
      const result = resolveCreativeDirection({ [field]: "x" });
      expect(result).toBeDefined();
      expect(result?.[field]).toBe("x");
    }
  });
});
