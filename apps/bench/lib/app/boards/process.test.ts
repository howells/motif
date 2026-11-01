import { describe, expect, it } from "vitest";

import {
  FILL_CEILING,
  beatsOfNode,
  collapsed,
  easedShare,
  foldBeats,
  latestRunOf,
  logRows,
  makingOf,
  offsetLabel,
  processForNode,
  processOf,
  recent,
  shortText,
  summaryOf,
  wellBeats,
} from "./process";
import type { RunRef } from "./process";
import type { Beat, RunEventKind } from "./run-events";

const NODE = `nod_${"a".repeat(32)}`;
const OTHER = `nod_${"b".repeat(32)}`;

const beat = (
  seq: number,
  kind: RunEventKind,
  text: string,
  options: { at?: number; data?: Beat["data"]; nodeId?: string | null } = {}
): Beat => ({
  at: new Date(
    Date.parse("2026-11-01T10:00:00.000Z") + (options.at ?? seq * 1000)
  ).toISOString(),
  data: options.data ?? null,
  kind,
  nodeId: options.nodeId === undefined ? NODE : options.nodeId,
  seq,
  text,
});

describe("foldBeats", () => {
  it("merges by sequence number, in order, without repeats", () => {
    const held = [beat(1, "read", "a"), beat(3, "send", "c")];
    const folded = foldBeats(held, [
      beat(2, "price", "b"),
      beat(3, "send", "c"),
    ]);
    expect(folded.map((item) => item.seq)).toEqual([1, 2, 3]);
  });
});

describe("a node's process", () => {
  const all = [
    beat(1, "run", "Starting the run", { nodeId: null }),
    beat(2, "begin", "Starting"),
    beat(3, "read", "Reading the Prompt", { nodeId: OTHER }),
    beat(4, "price", "Pricing again"),
  ];

  it("takes only the beats about the node", () => {
    expect(beatsOfNode(all, NODE).map((item) => item.seq)).toEqual([2, 4]);
  });

  it("is live while the run goes and the node has not finished", () => {
    const mine = beatsOfNode(all, NODE);
    expect(processOf(mine, "running")).toMatchObject({
      failed: false,
      finished: false,
      live: true,
    });
    expect(processOf([], "running").live).toBe(false);
    const done = [...mine, beat(5, "done", "Finished")];
    expect(processOf(done, "running")).toMatchObject({
      finished: true,
      live: false,
    });
    expect(processOf(mine, "completed").live).toBe(false);
  });

  it("is failed when it said so", () => {
    expect(
      processOf([beat(1, "error", "Generate didn't finish")], "failed")
    ).toMatchObject({ failed: true, finished: true, live: false });
  });
});

describe("recent", () => {
  const beats = [1, 2, 3, 4, 5].map((seq) => beat(seq, "read", `Line ${seq}`));

  it("is the current beat and up to `depth` before it, nearest last", () => {
    const { current, past } = recent(beats, 3);
    expect(current?.seq).toBe(5);
    expect(past.map((item) => item.seq)).toEqual([2, 3, 4]);
  });

  it("copes with few beats", () => {
    expect(recent([], 3)).toEqual({ current: undefined, past: [] });
    expect(recent(beats.slice(0, 1), 3)).toMatchObject({ past: [] });
    expect(recent(beats.slice(0, 2), 3).past.map((item) => item.seq)).toEqual([
      1,
    ]);
  });
});

describe("offsetLabel", () => {
  it("is the seconds after the run began", () => {
    expect(
      offsetLabel(
        beat(1, "read", "a", { at: 4200 }),
        Date.parse("2026-11-01T10:00:00.000Z")
      )
    ).toBe("4.2 s");
  });
});

describe("shortText", () => {
  it("keeps what a beat said in fewer words, never an ellipsis", () => {
    expect(
      shortText(
        beat(1, "send", "Sending to fal: Grok Imagine Image 2.0", {
          data: { model: "Grok Imagine Image 2.0" },
        })
      )
    ).toBe("Sent to fal");
    expect(shortText(beat(2, "read", "Reading the Prompt"))).toBe(
      "Read the Prompt"
    );
    expect(shortText(beat(3, "send", "fal has it"))).toBe("fal has it");
    expect(shortText(beat(4, "price", "Price checked again: $0.080"))).toBe(
      "Price checked"
    );
    expect(shortText(beat(5, "error", "Generate didn't finish"))).toBe(
      "Generate didn't finish"
    );
  });
});

describe("repeated quiet beats", () => {
  const beats = [
    beat(1, "make", "fal is making it"),
    beat(2, "wait", "Still making it, 15 s in"),
    beat(3, "log", "step 4"),
    beat(4, "wait", "Still making it, 30 s in"),
  ];

  it("keeps only the latest, in the well and in the log", () => {
    expect(collapsed(beats).map((item) => item.seq)).toEqual([1, 3, 4]);
    expect(wellBeats(beats).map((item) => item.seq)).toEqual([1, 3, 4]);
    expect(logRows(beats).map((row) => row.beat.seq)).toEqual([1, 3, 4]);
  });

  it("leaves the typical time out of the well and under the beat before it in the log", () => {
    const typical = beat(2, "make", "Muse usually takes about 50 s", {
      data: { typicalMs: 50_000 },
    });
    const held = [beat(1, "make", "fal is making it"), typical];
    expect(wellBeats(held).map((item) => item.seq)).toEqual([1]);
    expect(logRows(held)).toEqual([
      { beat: held[0], note: "Muse usually takes about 50 s" },
    ]);
  });
});

describe("summaryOf", () => {
  it("is steps, time and how the money ended", () => {
    const beats = [
      beat(1, "begin", "Starting", { at: 0 }),
      beat(2, "read", "Reading", { at: 500 }),
      beat(3, "price", "Pricing", { at: 900 }),
      beat(4, "hold", "Holding", { at: 1000 }),
      beat(5, "send", "Sending", { at: 1500 }),
      beat(6, "make", "Making", { at: 9000 }),
      beat(7, "store", "Stored", { at: 30_000 }),
      beat(8, "settle", "Counted", {
        at: 30_500,
        data: { estimated: true, micros: 500_000 },
      }),
      beat(9, "pick", "Kept", { at: 31_000 }),
      beat(10, "done", "Finished", { at: 31_000 }),
    ];
    expect(summaryOf(beats)).toBe(
      "8 steps · 31 s · Counted at $0.500, estimate"
    );
  });

  it("says settled when fal gave a price, and sums a Compare's Models", () => {
    const beats = [
      beat(1, "begin", "Starting", { at: 0 }),
      beat(2, "settle", "a", {
        at: 2000,
        data: { estimated: false, micros: 40_000 },
      }),
      beat(3, "settle", "b", {
        at: 3000,
        data: { estimated: false, micros: 30_000 },
      }),
    ];
    expect(summaryOf(beats)).toBe("2 steps · 3.0 s · Settled at $0.070");
  });

  it("gives a failure in its own words in place of the money", () => {
    const beats = [
      beat(1, "begin", "Starting", { at: 0 }),
      beat(2, "error", "Generate didn't finish: fal said no.", { at: 2000 }),
    ];
    expect(summaryOf(beats)).toBe(
      "1 step · 2.0 s · Generate didn't finish: fal said no."
    );
  });

  it("is empty with nothing to summarise", () => {
    expect(summaryOf([])).toBe("");
  });
});

describe("easedShare", () => {
  it("quickens then slows, and is never full", () => {
    const typical = 50_000;
    const at = (seconds: number) => easedShare(seconds * 1000, typical);
    expect(at(0)).toBe(0);
    expect(at(5)).toBeGreaterThan(0.15);
    expect(at(25) - at(0)).toBeGreaterThan(at(50) - at(25));
    expect(at(50) - at(25)).toBeGreaterThan(at(100) - at(75));
    expect(at(50)).toBeGreaterThan(0.8);
    expect(at(50)).toBeLessThan(0.9);
    for (const seconds of [10, 50, 100, 500, 5000]) {
      expect(at(seconds)).toBeLessThan(1);
      expect(at(seconds)).toBeLessThanOrEqual(FILL_CEILING);
    }
  });

  it("cannot run backwards or divide by nothing", () => {
    expect(easedShare(-5, 1000)).toBe(0);
    expect(easedShare(1000, 0)).toBe(0);
  });
});

describe("makingOf", () => {
  const usually = beat(7, "make", "Grok usually takes about 50 s", {
    at: 400,
    data: { typicalMs: 50_000 },
  });

  it("reads the owner's typical time and when fal began from the beat that said it", () => {
    const making = makingOf([beat(6, "make", "fal is making it"), usually]);
    expect(making).toStrictEqual({
      startedAt: Date.parse("2026-11-01T10:00:00.400Z"),
      typicalMs: 50_000,
    });
  });

  it("is absent without history, so the rail only sweeps", () => {
    expect(makingOf([beat(6, "make", "fal is making it")])).toBeNull();
    expect(makingOf([])).toBeNull();
  });
});

describe("a node and its panel", () => {
  const runs: RunRef[] = [
    { id: "brun_new", nodeIds: [NODE], status: "running" },
    { id: "brun_old", nodeIds: [NODE, OTHER], status: "completed" },
  ];
  const feed = (runId: string | null, count: number) => ({
    beats: Array.from({ length: count }, (_, i) =>
      beat(i + 1, "read", `Line ${i + 1}`)
    ),
    runId,
  });

  it("read the same beats of the same run, so they cannot disagree", () => {
    // Asked twice, as the node and the panel ask it, of the same feeds.
    const feeds = [feed("brun_new", 8), feed("brun_old", 3)];
    const node = processForNode(runs, feeds, NODE);
    const panel = processForNode(runs, feeds, NODE);
    expect(panel).toStrictEqual(node);
    expect(node.beats).toHaveLength(8);
    expect(node.live).toBe(true);
  });

  it("follow the newest run even while an older one is also held", () => {
    const feeds = [feed("brun_old", 3), feed("brun_new", 8)];
    expect(processForNode(runs, feeds, NODE).beats).toHaveLength(8);
    expect(latestRunOf(runs, NODE)?.id).toBe("brun_new");
    expect(latestRunOf(runs, OTHER)?.id).toBe("brun_old");
  });

  it("have nothing until the newest run's feed arrives", () => {
    expect(
      processForNode(runs, [feed("brun_old", 3)], NODE).beats
    ).toHaveLength(0);
  });
});

describe("summaryOf, with waiting beats", () => {
  it("does not count 'still making it' as steps", () => {
    const beats = [
      beat(1, "begin", "Starting", { at: 0 }),
      beat(2, "make", "fal is making it", { at: 500 }),
      beat(3, "wait", "Still making it, 15 s in", { at: 15_500 }),
      beat(4, "wait", "Still making it, 30 s in", { at: 30_500 }),
      beat(5, "done", "Finished", { at: 31_000 }),
    ];
    expect(summaryOf(beats)).toBe("1 step · 31 s");
  });
});
