import { describe, expect, it } from "vitest";

import type { WorkerEvent } from "../tasks/execute";
import type { Generation } from "../tasks/store";
import {
  ELAPSED_EVERY_MS,
  MAX_LOG_LINES,
  Narrator,
  Waiting,
  armHomeLine,
  compareHoldLine,
  holdLine,
  priceLine,
  queueLine,
  readLine,
  settledLine,
  staleLine,
  typicalLine,
  workerLine,
} from "./run-voice";
import type { Line } from "./run-voice";
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

  it("says the price as the approval showed it, apart from the hold", () => {
    // Grok: $0.080 to list, $0.100 held, $0.100 approved.
    expect(priceLine(80_000, 100_000, 100_000).text).toBe(
      "Price checked again: $0.080"
    );
    expect(holdLine(100_000).text).toBe(
      "Holding up to $0.100 until fal settles"
    );
  });

  it("mentions what was approved only when the hold is not what was approved", () => {
    expect(priceLine(50_000, 60_000, 100_000).text).toBe(
      "Price checked again: $0.050 (you approved holding up to $0.100)"
    );
  });

  it("holds, queues and makes in plain words", () => {
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
    ).toBe("Nothing charged, $0.500 released");
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
      "Holding up to $0.070 together: Muse $0.040 and Grok Imagine $0.030"
    );
    expect(armHomeLine("Muse", 4200, true).text).toBe(
      "Muse came back first, 4.2 s"
    );
    expect(armHomeLine("Grok Imagine", null, false).text).toBe(
      "Grok Imagine came back"
    );
  });
});

const polled = (status: string, queuePosition?: number): WorkerEvent => ({
  kind: "polled",
  queuePosition,
  status,
});

const changed = (status: string, queuePosition?: number): WorkerEvent => ({
  kind: "queue",
  queuePosition,
  status,
});

describe("typicalLine", () => {
  it("says what this owner's history says, in the Model's name", () => {
    expect(typicalLine("Grok Imagine Image 2.0", 50_000).text).toBe(
      "Grok Imagine Image 2.0 usually takes about 50 s"
    );
    expect(typicalLine("Muse", 4200).data).toStrictEqual({
      model: "Muse",
      typicalMs: 4200,
    });
  });
});

describe("Waiting", () => {
  it("says it is still making it every fifteen seconds of no news", () => {
    const waiting = new Waiting(0);
    expect(waiting.see(changed("processing"), 1000)).toBeNull();
    expect(waiting.see(polled("processing"), 4000)).toBeNull();
    // Counted from when the wait began, which is known to be 0.
    expect(waiting.see(polled("processing"), 16_000)?.text).toBe(
      "Still making it, 16 s in"
    );
    expect(waiting.see(polled("processing"), 19_000)).toBeNull();
    expect(waiting.see(polled("processing"), 31_000)?.text).toBe(
      "Still making it, 31 s in"
    );
  });

  it("starts counting again from news, and says the queue in its own words", () => {
    const waiting = new Waiting(0);
    waiting.see(changed("queued", 5), 0);
    expect(waiting.see(polled("queued", 5), 15_000)?.text).toBe(
      "Still in the queue, 15 s in"
    );
    // A place gained is news: the count to the next line starts there.
    waiting.see(changed("queued", 4), 20_000);
    expect(waiting.see(polled("queued", 4), 30_000)).toBeNull();
    expect(waiting.see(polled("queued", 4), 35_000)?.text).toContain(
      "Still in the queue"
    );
    waiting.see(changed("processing"), 36_000);
    expect(waiting.see(polled("processing"), 51_000)?.text).toBe(
      "Still making it, 15 s in"
    );
  });

  it("counts a run picked up from an earlier drive from when it was sent", () => {
    const waiting = new Waiting(0);
    expect(waiting.see(changed("processing"), 40_000)).toBeNull();
    expect(waiting.see(polled("processing"), 55_000)?.text).toBe(
      "Still making it, 55 s in"
    );
  });

  it("is silent when fal has finished", () => {
    const waiting = new Waiting(0);
    waiting.see(changed("completed"), 1000);
    expect(waiting.see(polled("completed"), ELAPSED_EVERY_MS * 2)).toBeNull();
  });
});

const typical: Line = typicalLine("Grok Imagine Image 2.0", 50_000);

/** Everything said for a run of worker events at the given times. */
const said = async (
  events: readonly (readonly [number, WorkerEvent])[],
  lookup: () => Promise<Line | null> = async () =>
    await Promise.resolve(typical)
) => {
  const narrator = new Narrator({
    name: "Grok Imagine Image 2.0",
    origin: 0,
    typical: lookup,
  });
  const out: Line[] = [];
  for (const [at, event] of events) {
    out.push(...(await narrator.lines(event, at)));
  }
  return out;
};

describe("Narrator", () => {
  it("fills the wait, and keeps the image-back beats that follow it", async () => {
    // The run that came back from the real site: sent, taken, made, then the
    // image arriving 55 s later.
    const out = await said([
      [100, { kind: "sending" }],
      [200, { kind: "accepted", requestId: "req-1" }],
      [300, changed("processing")],
      [3300, polled("processing")],
      [18_300, polled("processing")],
      [33_300, polled("processing")],
      [48_300, polled("processing")],
      [54_900, changed("completed")],
      [55_000, { count: 1, kind: "downloading" }],
      [
        56_000,
        { bytes: 900_000, count: 1, height: 2048, kind: "stored", width: 2048 },
      ],
    ]);
    expect(out.map((line) => [line.kind, line.text])).toStrictEqual([
      ["send", "Sending to fal: Grok Imagine Image 2.0"],
      ["send", "fal has it"],
      ["make", "fal is making it"],
      ["make", "Grok Imagine Image 2.0 usually takes about 50 s"],
      ["wait", "Still making it, 18 s in"],
      ["wait", "Still making it, 33 s in"],
      ["wait", "Still making it, 48 s in"],
      ["make", "fal has finished"],
      ["image", "The image is back, bringing it in"],
      ["store", "Stored, 2048 × 2048"],
    ]);
  });

  it("says nothing about duration without history", async () => {
    const out = await said(
      [[0, changed("processing")]],
      async () => await Promise.resolve(null)
    );
    expect(out.map((line) => line.text)).toStrictEqual(["fal is making it"]);
  });

  it("asks for the history once", async () => {
    let asked = 0;
    await said(
      [
        [0, changed("processing")],
        [10, changed("processing")],
      ],
      async () => {
        asked += 1;
        return await Promise.resolve(null);
      }
    );
    expect(asked).toBe(1);
  });

  it("passes on fal's log lines, few of them", async () => {
    const many = Array.from(
      { length: MAX_LOG_LINES + 5 },
      (_, i) => `step ${i}`
    );
    const out = await said([
      [0, { kind: "logs", lines: many }],
      [1, { kind: "logs", lines: ["one more"] }],
    ]);
    expect(out).toHaveLength(MAX_LOG_LINES);
    expect(out[0]).toStrictEqual({ kind: "log", text: "step 0" });
  });
});
