import { describe, expect, it } from "vitest";

import {
  downstreamOf,
  parseSettings,
  runLevels,
  staleAfterEdit,
  staleAfterPick,
  wireRefusal,
} from "./model";
import type { GraphNode, GraphWire, NodeKind } from "./model";

const node = (
  id: string,
  kind: NodeKind,
  pick: string | null = null
): GraphNode => ({
  id,
  kind,
  pickAssetId: pick,
  stale: false,
});

const wire = (from: string, to: string): GraphWire => ({
  from,
  id: `${from}-${to}`,
  to,
});

/** Prompt → Generate → Erase → Upscale, and Source → Reframe, as on the
 * resting Board. Generate also feeds Vary. */
const nodes = [
  node("prompt", "prompt"),
  node("generate", "generate", "ast_g"),
  node("erase", "erase", "ast_e"),
  node("upscale", "upscale", "ast_u"),
  node("vary", "vary"),
  node("source", "source", "ast_s"),
  node("reframe", "reframe", "ast_r"),
];
const wires = [
  wire("prompt", "generate"),
  wire("generate", "erase"),
  wire("erase", "upscale"),
  wire("generate", "vary"),
  wire("source", "reframe"),
];

describe(downstreamOf, () => {
  it("walks every wire below a node, nearest first", () => {
    expect(downstreamOf("generate", wires)).toStrictEqual([
      "erase",
      "vary",
      "upscale",
    ]);
    expect(downstreamOf("upscale", wires)).toStrictEqual([]);
  });
});

describe(wireRefusal, () => {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const get = (id: string): GraphNode => {
    const found = byId.get(id);
    if (found === undefined) {
      throw new Error(id);
    }
    return found;
  };

  it("lets a Prompt feed Generate and an image feed an image Task", () => {
    expect(wireRefusal(get("prompt"), get("generate"), [])).toBeNull();
    expect(wireRefusal(get("source"), get("erase"), [])).toBeNull();
  });

  it("refuses text into an image Task, an image into Generate, and inputs", () => {
    expect(wireRefusal(get("prompt"), get("erase"), [])).toBe(
      "Erase takes an image, not text."
    );
    expect(wireRefusal(get("source"), get("generate"), [])).toBe(
      "Generate takes a Prompt."
    );
    expect(wireRefusal(get("generate"), get("source"), [])).toBe(
      "Source doesn't take an input."
    );
  });

  it("refuses a loop", () => {
    expect(wireRefusal(get("upscale"), get("erase"), wires)).toBe(
      "That wire would make a loop."
    );
  });
});

describe("Stale", () => {
  it("marks the edited node and everything with a result below it", () => {
    expect(staleAfterEdit("generate", nodes, wires)).toStrictEqual([
      "generate",
      "erase",
      "upscale",
    ]);
  });

  it("never marks a node with no result, and never a Prompt", () => {
    expect(staleAfterEdit("prompt", nodes, wires)).toStrictEqual([
      "generate",
      "erase",
      "upscale",
    ]);
    expect(staleAfterEdit("vary", nodes, wires)).toStrictEqual([]);
  });

  it("marks only what is below when the Pick changes", () => {
    expect(staleAfterPick("generate", nodes, wires)).toStrictEqual([
      "erase",
      "upscale",
    ]);
    expect(staleAfterPick("source", nodes, wires)).toStrictEqual(["reframe"]);
  });
});

describe(runLevels, () => {
  it("runs one node for Run", () => {
    expect(runLevels("erase", "node", nodes, wires)).toStrictEqual([["erase"]]);
    expect(runLevels("prompt", "node", nodes, wires)).toStrictEqual([]);
  });

  it("runs siblings together and waits for what feeds them", () => {
    expect(runLevels("generate", "downstream", nodes, wires)).toStrictEqual([
      ["generate"],
      ["erase", "vary"],
      ["upscale"],
    ]);
  });

  it("starts from what a Prompt or Source feeds", () => {
    expect(runLevels("prompt", "downstream", nodes, wires)).toStrictEqual([
      ["generate"],
      ["erase", "vary"],
      ["upscale"],
    ]);
    expect(runLevels("source", "downstream", nodes, wires)).toStrictEqual([
      ["reframe"],
    ]);
  });
});

describe(parseSettings, () => {
  it("fills defaults and refuses options a node doesn't have", () => {
    const parsed = parseSettings("upscale", {});
    expect(parsed).toStrictEqual({
      node: { kind: "upscale", settings: { detail: "faithful", scale: 2 } },
      ok: true,
    });
    expect(parseSettings("upscale", { scale: 3 }).ok).toBe(false);
    expect(parseSettings("cutout", { prompt: "x" }).ok).toBe(false);
  });
});
