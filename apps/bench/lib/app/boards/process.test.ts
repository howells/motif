import { describe, expect, it } from "vitest";

import {
  beatsOfNode,
  foldBeats,
  offsetLabel,
  processOf,
  recent,
  summaryOf,
} from "./process";
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
  it("is the seconds after the node's first beat", () => {
    expect(
      offsetLabel(
        beat(1, "read", "a", { at: 4200 }),
        beat(1, "read", "a", { at: 0 })
      )
    ).toBe("4.2 s");
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
