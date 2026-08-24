import { FAL_TOOLS } from "@howells/motif-sdk";
import { describe, expect, it } from "vitest";

import { resolveOutputLabels } from "../src/commands/output-labels";

/**
 * Layer names come out of a model's response and become filenames. This is the
 * adversarial half of that: whatever the response says, the stem that reaches
 * the filesystem has to be inert, and a name that cannot be made inert has to
 * cost the whole key its labels rather than leaving one bad stem among good
 * ones.
 */
/** The shipped entry, so this tests the real rule rather than a stand-in. */
const TOOL = FAL_TOOLS["seedream-layerize"];

function layers(names: readonly string[]) {
  return {
    layers: names.map((name, z) => ({
      image: { url: `https://example.com/${z}.png` },
      name,
      z_index: z,
    })),
  };
}

describe("layer names are inert as filenames", () => {
  it("yields only lowercase alphanumerics and hyphens, whatever the response says", () => {
    const hostile = [
      "../../etc/passwd",
      "/absolute/path",
      "..\\..\\windows",
      "name/with/slashes",
      "%2e%2e%2fescape",
      "$(rm -rf /)",
      "Left amber glass BOTTLE",
      "a".repeat(500),
    ];

    const resolved = resolveOutputLabels(TOOL, {}, layers(hostile))?.layers;

    expect(resolved).toHaveLength(hostile.length);
    for (const label of resolved ?? []) {
      expect(label, `produced from a hostile name`).toMatch(/^[a-z0-9-]+$/);
      expect(label).not.toContain("..");
      expect(label.startsWith(".")).toBe(false);
      expect(label.length).toBeLessThanOrEqual(64);
    }
  });

  it("drops the whole key when one name cannot survive slugification", () => {
    // "..." and "   " reduce to nothing. Naming four of five layers and
    // numbering the fifth reads as if the numbered one came first.
    const resolved = resolveOutputLabels(
      TOOL,
      {},
      layers(["Bowl", "...", "Bottle"])
    );

    expect(resolved?.layers).toBeUndefined();
  });
});
