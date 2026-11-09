import { describe, expect, it } from "vitest";

import { GROUPS } from "./commands";

const COMMANDS = GROUPS.flatMap((group) => group.commands);

describe("command headlines", () => {
  it.each(COMMANDS.map((spec) => [spec.id, spec.headline]))(
    "%s leads with a headline",
    (_id, headline) => {
      expect(headline.trim()).not.toBe("");
    }
  );

  it("reads as a phrase, not a sentence or a command", () => {
    for (const spec of COMMANDS) {
      expect(spec.headline, spec.id).not.toMatch(/\.$/u);
      expect(spec.headline, spec.id).not.toBe(spec.id);
      expect(spec.headline.at(0), spec.id).toBe(
        spec.headline.at(0)?.toUpperCase()
      );
    }
  });

  it("uses the homepage's words for erase", () => {
    const erase = COMMANDS.find((spec) => spec.id === "erase");
    expect(erase?.headline).toBe("Remove an object");
  });
});
