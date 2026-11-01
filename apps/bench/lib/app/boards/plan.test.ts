import { describe, expect, it } from "vitest";

import { parseSettings } from "./model";
import type { NodeKind, SettingsPatch } from "./model";
import { PENDING_ASSET_ID, buildRequests, inputFor, quoteRun } from "./plan";
import type { BoardNode, Graph } from "./store";

const OWNER = "mem_0123456789abcdef0123456789abcdef";
const ASSET = `ast_${"a".repeat(32)}`;

/** A node as the store would read it: settings parsed for its kind. */
const make = (
  id: string,
  kind: NodeKind,
  settings: SettingsPatch = {},
  pickAssetId: string | null = null
): BoardNode => {
  const read = parseSettings(kind, settings);
  if (!read.ok) {
    throw new Error(read.message);
  }
  return {
    ...read.node,
    boardId: "brd_x",
    id,
    pickAssetId,
    stale: false,
    x: 0,
    y: 0,
  };
};

/** The cost-approval board: Prompt → Generate (4 images) → Erase → Upscale. */
const chain: Graph = {
  nodes: [
    make("p", "prompt", {
      look: "still-life",
      mood: "raking",
      text: "Amber apothecary bottles and a stoneware bowl on a stone shelf",
    }),
    make("g", "generate", { aspect: "16:9", count: 4, model: "grok-image" }),
    make("e", "erase", { prompt: "the smallest bottle" }),
    make("u", "upscale", { scale: 2 }),
  ],
  wires: [
    { from: "p", id: "w1", to: "g" },
    { from: "g", id: "w2", to: "e" },
    { from: "e", id: "w3", to: "u" },
  ],
};

describe(buildRequests, () => {
  it("carries the Prompt's text, Look and Mood into Generate", () => {
    const [prompt, generate] = chain.nodes;
    if (prompt === undefined || generate === undefined) {
      throw new Error("fixture");
    }
    const input = inputFor(generate, chain, new Map());
    expect(input).toStrictEqual({
      kind: "text",
      look: "still-life",
      mood: "raking",
      prompt: "Amber apothecary bottles and a stoneware bowl on a stone shelf",
    });
    const built = buildRequests(generate, input);
    expect(built.ok && built.requests[0]).toMatchObject({
      aspect: "16:9",
      count: 4,
      look: "still-life",
      model: "grok-image",
      mood: "raking",
      task: "generate",
    });
  });

  it("says what is missing instead of guessing", () => {
    const erase = make("e2", "erase", { prompt: "" });
    expect(buildRequests(erase, { kind: "none" })).toStrictEqual({
      ok: false,
      reason:
        "Erase needs an image wired in: a Source, or a node that makes one.",
    });
    expect(
      buildRequests(erase, {
        assetId: ASSET,
        kind: "image",
        pending: false,
        size: { height: 100, width: 100 },
      })
    ).toStrictEqual({ ok: false, reason: "Say what Erase should remove." });
    expect(
      buildRequests(make("g2", "generate"), { kind: "text", prompt: "  " })
    ).toStrictEqual({ ok: false, reason: "Write the Prompt first." });
  });

  it("asks one request per Model for Compare", () => {
    const compare = make("c", "compare", {
      models: ["seedream4", "grok-image"],
    });
    const built = buildRequests(compare, { kind: "text", prompt: "a vase" });
    expect(
      built.ok && built.requests.map((request) => request.model)
    ).toStrictEqual(["seedream4", "grok-image"]);
    expect(
      buildRequests(make("c2", "compare", { models: ["seedream4"] }), {
        kind: "text",
        prompt: "a vase",
      })
    ).toStrictEqual({
      ok: false,
      reason: "Choose at least two Models to compare.",
    });
  });
});

describe("Pick flow", () => {
  it("feeds the upstream Pick to the node below", () => {
    const graph: Graph = {
      nodes: [
        make("s", "source", {}, ASSET),
        make("r", "reframe", { aspect: "1:1" }),
      ],
      wires: [{ from: "s", id: "w", to: "r" }],
    };
    const [, reframe] = graph.nodes;
    if (reframe === undefined) {
      throw new Error("fixture");
    }
    expect(
      inputFor(reframe, graph, new Map([[ASSET, { height: 781, width: 1400 }]]))
    ).toStrictEqual({
      assetId: ASSET,
      kind: "image",
      pending: false,
      size: { height: 781, width: 1400 },
    });
  });

  it("uses what an earlier step will make, not the old Pick, inside a run", () => {
    const graph: Graph = {
      nodes: [
        make("s", "source", {}, ASSET),
        make("x", "cutout", {}, `ast_${"b".repeat(32)}`),
      ],
      wires: [{ from: "s", id: "w", to: "x" }],
    };
    const [, cutout] = graph.nodes;
    if (cutout === undefined) {
      throw new Error("fixture");
    }
    expect(
      inputFor(
        cutout,
        graph,
        new Map(),
        new Map([["s", { height: 10, width: 20 }]])
      )
    ).toStrictEqual({
      assetId: PENDING_ASSET_ID,
      kind: "image",
      pending: true,
      size: { height: 10, width: 20 },
    });
  });
});

describe(quoteRun, () => {
  it("prices Run from here as one combined quote, in order", () => {
    const quoted = quoteRun(chain, "g", "downstream", new Map(), OWNER);
    expect(quoted.levels).toStrictEqual([["g"], ["e"], ["u"]]);
    expect(quoted.ready).toBe(true);
    expect(quoted.steps.map((step) => step.label)).toStrictEqual([
      "Generate",
      "Erase",
      "Upscale",
    ]);
    const total = quoted.steps.reduce(
      (sum, step) => sum + (step.ok ? step.micros : 0),
      0
    );
    expect(quoted.micros).toBe(total);
    expect(quoted.listMicros).toBeLessThan(quoted.micros);
  });

  it("names each step's Model and what it works on", () => {
    const [generate, erase, upscale] = quoteRun(
      chain,
      "g",
      "downstream",
      new Map(),
      OWNER
    ).steps;
    expect(generate).toMatchObject({
      detail: "Grok Imagine Image, 4 images",
      listMicros: 80_000,
      ok: true,
    });
    expect(erase).toMatchObject({ estimated: true, ok: true });
    expect(erase?.ok === true && erase.detail).toMatch(/on the new Pick$/u);
    expect(upscale?.ok === true && upscale.detail).toMatch(/2× to \d+ × \d+$/u);
  });

  it("prices Run on one node alone", () => {
    const quoted = quoteRun(chain, "g", "node", new Map(), OWNER);
    expect(quoted.steps).toHaveLength(1);
    expect(quoted.listMicros).toBe(80_000);
  });

  it("refuses an unbounded Model and offers ones that can be held", () => {
    const graph: Graph = {
      nodes: [
        make("p", "prompt", { text: "A vase" }),
        make("g", "generate", { model: "seedream4" }),
      ],
      wires: [{ from: "p", id: "w", to: "g" }],
    };
    const [step] = quoteRun(graph, "g", "node", new Map(), OWNER).steps;
    expect(step?.ok).toBe(false);
    expect(step?.ok === false && step.reason).toMatch(
      /^Seedream 4.0 bills by usage/u
    );
    expect(step?.ok === false && step.alternatives.length).toBeGreaterThan(0);
  });

  it("is not ready when any step can't run, and names it", () => {
    const empty: Graph = {
      ...chain,
      nodes: chain.nodes.map((item) =>
        item.id === "p" ? { ...item, settings: { text: "" } } : item
      ),
    };
    const quoted = quoteRun(empty, "g", "downstream", new Map(), OWNER);
    expect(quoted.ready).toBe(false);
    expect(quoted.steps[0]).toMatchObject({
      ok: false,
      reason: "Write the Prompt first.",
    });
  });

  it("adds every Compare Model into one price", () => {
    const graph: Graph = {
      nodes: [
        make("p", "prompt", { text: "A stoneware vase on linen" }),
        make("c", "compare", { models: ["grok-image", "muse-image"] }),
      ],
      wires: [{ from: "p", id: "w", to: "c" }],
    };
    const quoted = quoteRun(graph, "c", "node", new Map(), OWNER);
    expect(quoted.ready).toBe(true);
    expect(quoted.listMicros).toBe(30_000);
  });
});
