import { describe, expect, it } from "vitest";

import { promptWarnings } from "../src/index";

describe(promptWarnings, () => {
  it("returns nothing for a plain prompt", () => {
    expect(promptWarnings("a green kitchen with oak cabinets")).toStrictEqual(
      []
    );
  });

  it("flags a negated object, with or without an article", () => {
    const warnings = promptWarnings("a bare room, no chairs, no a rug");

    expect(
      warnings.map((warning) => [warning.rule, warning.match])
    ).toStrictEqual([
      ["negated-object", "no chairs"],
      ["negated-object", "no a rug"],
    ]);
    expect(warnings[0]?.message).toContain("Describe what is present instead");
  });

  it("allows the negations models handle", () => {
    expect(
      promptWarnings(
        "No text, no logos, no logo, no people, no person, no faces, no watermark, no watermarks, no words, no lettering"
      )
    ).toStrictEqual([]);
  });

  it("flags a text-bearing object alongside a request for no text", () => {
    const warnings = promptWarnings("a shop sign on a brick wall, no text");
    expect(
      warnings.map((warning) => [warning.rule, warning.match])
    ).toStrictEqual([["text-bearing-object", "sign"]]);
    expect(warnings[0]?.message).toContain("render text on it anyway");
    expect(promptWarnings("a stack of books, no words")[0]?.rule).toBe(
      "text-bearing-object"
    );
  });

  it("leaves a text-bearing object alone when text is not refused", () => {
    expect(promptWarnings("a vintage boxing poster")).toStrictEqual([]);
  });
});
