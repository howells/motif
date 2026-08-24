// Guards the generated argument table against drifting away from the registry
// it describes. An undocumented argument is an argument no agent will ever
// send, which is how 36 of them stayed invisible until an audit found them.
//
// Offline by design: no network, no shelling out to the sync script.

import { describe, expect, it } from "vitest";

import {
  FAL_TOOL_PARAMETERS,
  falToolParameters,
} from "../src/tool-parameters.generated";
import { FAL_TOOL_IDS } from "../src/tools";

describe("fal tool parameters", () => {
  it("documents every registered tool", () => {
    const missing = FAL_TOOL_IDS.filter(
      (id) => FAL_TOOL_PARAMETERS[id] === undefined
    );

    expect(missing).toEqual([]);
  });

  it("documents no tool the registry does not have", () => {
    const known = new Set<string>(FAL_TOOL_IDS);
    const unknown = Object.keys(FAL_TOOL_PARAMETERS).filter(
      (id) => !known.has(id)
    );

    expect(unknown).toEqual([]);
  });

  it("returns an empty list for an unknown tool rather than throwing", () => {
    expect(falToolParameters("not-a-tool")).toEqual([]);
  });

  it("returns the same list as the table for a known tool", () => {
    expect(falToolParameters("birefnet")).toBe(FAL_TOOL_PARAMETERS.birefnet);
    expect(falToolParameters("birefnet").map((p) => p.key)).toContain(
      "output_mask"
    );
  });
});
