import { describe, expect, it } from "vitest";

import type { Generation } from "../tasks/store";
import {
  armHomeLine,
  compareHoldLine,
  holdLine,
  priceLine,
  queueLine,
  readLine,
  settledLine,
  staleLine,
  workerLine,
} from "./run-voice";
import type { BoardNode, BoardWire } from "./store";

const PROMPT = `nod_${"1".repeat(32)}`;
const GENERATE = `nod_${"2".repeat(32)}`;
const REFERENCE = `ast_${"3".repeat(32)}`;

const prompt = (settings: { look?: string; mood?: string }): BoardNode => ({
  boardId: "brd_x",
  id: PROMPT,
  kind: "prompt",
  pickAssetId: null,
  settings: { text: "Amber bottles", ...settings },
  stale: false,
  x: 0,
  y: 0,
});

const generate = (references: string[]): BoardNode => ({
  boardId: "brd_x",
  id: GENERATE,
  kind: "generate",
  pickAssetId: null,
  settings: { count: 1, references },
  stale: false,
  x: 0,
  y: 0,
});

const fed: BoardWire = { from: PROMPT, id: "wir_x", to: GENERATE };

const generation = (overrides: Partial<Generation>): Generation => ({
  boundMicros: 500_000,
  comparisonId: null,
  completedAt: null,
  costBasis: null,
  costMicros: null,
  costStatus: "held",
  createdAt: new Date(0),
  data: {},
  endpoint: "fal-ai/banana2",
  errorCode: null,
  errorMessage: null,
  holdId: "hld_x",
  id: "gen_x",
  input: {},
  leaseUntil: null,
  maskAssetId: null,
  mode: null,
  model: "banana2",
  outputAssetIds: [],
  ownerId: "mem_x",
  parentId: null,
  prompt: null,
  providerMs: null,
  referenceAssetIds: [],
  requestId: null,
  retryOf: null,
  sourceAssetId: null,
  stackId: "gen_x",
  status: "completed",
  submittedAt: null,
  task: "generate",
  tier: "balanced",
  ...overrides,
});

describe("what a run says", () => {
  it("reads what feeds the node, and its Look and Mood", () => {
    const target = generate([]);
    expect(
      readLine(target, {
        nodes: [prompt({ look: "lok_x", mood: "mod_x" }), target],
        wires: [fed],
      }).text
    ).toBe("Reading the Prompt, the Look and the Mood");
    expect(
      readLine(target, { nodes: [prompt({}), target], wires: [fed] }).text
    ).toBe("Reading the Prompt");
    const referenced = generate([REFERENCE]);
    expect(
      readLine(referenced, {
        nodes: [prompt({}), referenced],
        wires: [fed],
      }).text
    ).toBe("Reading the Prompt and 1 Reference image");
    expect(readLine(target, { nodes: [target], wires: [] }).text).toBe(
      "Reading its own settings"
    );
  });

  it("prices again against what was approved", () => {
    expect(priceLine(70_000, 100_000, true).text).toBe(
      "Pricing again on the real image: $0.070, within the $0.100 you approved"
    );
    expect(priceLine(70_000, 100_000, false).text).toContain(
      "on what it reads now"
    );
  });

  it("holds, queues and makes in plain words", () => {
    expect(holdLine(70_000).text).toBe("Holding $0.070 until fal settles");
    expect(queueLine("queued", 3)?.text).toBe("In the queue, 3 ahead");
    expect(queueLine("queued", 0)?.text).toBe("In the queue");
    expect(queueLine("processing")?.text).toBe("fal is making it");
    expect(queueLine("failed")).toBeNull();
  });

  it("names the Model it sends to and the image it gets back", () => {
    expect(workerLine({ kind: "sending" }, "Muse")?.text).toBe(
      "Sending to fal: Muse"
    );
    expect(
      workerLine(
        { bytes: 1000, count: 1, height: 1024, kind: "stored", width: 768 },
        "Muse"
      )?.text
    ).toBe("Stored, 768 × 1024");
    expect(workerLine({ count: 2, kind: "downloading" }, "Muse")?.text).toBe(
      "2 images are back, bringing them in"
    );
  });

  it("says how the money ended, and when fal gave no price", () => {
    expect(
      settledLine(generation({ costMicros: 70_000, costStatus: "settled" }))
        ?.text
    ).toBe("Settled at $0.070");
    expect(settledLine(generation({ costStatus: "retained" }))?.text).toBe(
      "fal didn't say, the $0.500 hold counts as an estimate"
    );
    expect(
      settledLine(generation({ costStatus: "released", status: "failed" }))
        ?.text
    ).toBe("Nothing was spent, the hold is released");
    expect(
      settledLine(generation({ costStatus: "retained", status: "failed" }))
        ?.text
    ).toBe("The $0.500 hold stays counted");
  });

  it("counts the nodes made Stale", () => {
    expect(staleLine(1).text).toBe("1 node below is now Stale");
    expect(staleLine(2).text).toBe("2 nodes below are now Stale");
  });

  it("holds a Compare's prices together and says who came back first", () => {
    expect(
      compareHoldLine([
        { micros: 40_000, name: "Muse" },
        { micros: 30_000, name: "Grok Imagine" },
      ]).text
    ).toBe(
      "Holding Muse $0.040 and Grok Imagine $0.030 together, $0.070 in all"
    );
    expect(armHomeLine("Muse", 4200, true).text).toBe(
      "Muse came back first, 4.2 s"
    );
    expect(armHomeLine("Grok Imagine", null, false).text).toBe(
      "Grok Imagine came back"
    );
  });
});
