import { describe, expect, it } from "vitest";

import type { Beat } from "./run-events";
import {
  END_FRAME,
  FEED_BUDGET_MS,
  FEED_TICK_MS,
  HEARTBEAT_FRAME,
  afterOf,
  beatFrame,
  feedFrames,
} from "./run-feed";
import type { FeedDeps } from "./run-feed";

const beat = (seq: number, text = `Beat ${seq}`): Beat => ({
  at: "2026-11-01T10:00:00.000Z",
  data: null,
  kind: "read",
  nodeId: null,
  seq,
  text,
});

/** A table of beats and a run status that tests change as time passes, read
 * through a clock that only moves when the feed sleeps. */
const harness = (
  options: {
    beats?: Beat[];
    running?: boolean;
    onSleep?: (clock: { now: number }, table: Beat[]) => void;
  } = {}
) => {
  const table = options.beats ?? [];
  const clock = { now: 0 };
  const state = {
    aborted: false,
    reads: [] as number[],
    running: options.running ?? true,
  };
  const deps: FeedDeps = {
    aborted: () => state.aborted,
    now: () => clock.now,
    read: async (after, limit) => {
      await Promise.resolve();
      state.reads.push(after);
      return table.filter((item) => item.seq > after).slice(0, limit);
    },
    running: async () => {
      await Promise.resolve();
      return state.running;
    },
    sleep: async (ms) => {
      await Promise.resolve();
      clock.now += ms;
      options.onSleep?.(clock, table);
    },
  };
  return { clock, deps, state, table };
};

const collect = async (frames: AsyncIterable<string>): Promise<string[]> => {
  const all: string[] = [];
  for await (const frame of frames) {
    all.push(frame);
  }
  return all;
};

describe("feedFrames", () => {
  it("sends what is there, then says end once the run has stopped and nothing is left", async () => {
    const { deps, state } = harness({
      beats: [beat(1), beat(2)],
      running: false,
    });
    const frames = await collect(feedFrames(deps, 0));
    expect(frames).toEqual([
      "retry: 2000\n\n",
      beatFrame(beat(1)),
      beatFrame(beat(2)),
      END_FRAME,
    ]);
    expect(state.reads).toEqual([0, 2]);
  });

  it("carries on from the sequence number it is given", async () => {
    const { deps } = harness({
      beats: [beat(1), beat(2), beat(3)],
      running: false,
    });
    const frames = await collect(feedFrames(deps, 2));
    expect(frames).toContain(beatFrame(beat(3)));
    expect(frames).not.toContain(beatFrame(beat(2)));
  });

  it("tails new beats while the run is going and ends after the run does", async () => {
    const { deps, state } = harness({
      onSleep: (clock, table) => {
        if (clock.now === FEED_TICK_MS) {
          table.push(beat(1));
        }
        if (clock.now === FEED_TICK_MS * 2) {
          table.push(beat(2));
          state.running = false;
        }
      },
    });
    const frames = await collect(feedFrames(deps, 0));
    expect(frames.filter((frame) => frame.startsWith("id:"))).toEqual([
      beatFrame(beat(1)),
      beatFrame(beat(2)),
    ]);
    expect(frames.at(-1)).toBe(END_FRAME);
  });

  it("does not drop a beat written in the instant the run ended", async () => {
    // The status is read before the table, so a beat written as the run
    // stops is still in the read that follows the stop.
    const { deps, state, table } = harness();
    state.running = false;
    table.push(beat(1));
    const frames = await collect(feedFrames(deps, 0));
    expect(frames).toEqual(["retry: 2000\n\n", beatFrame(beat(1)), END_FRAME]);
  });

  it("sends a keep-alive comment every fifteen seconds of quiet", async () => {
    const { deps, state, clock } = harness();
    const frames: string[] = [];
    for await (const frame of feedFrames(deps, 0)) {
      frames.push(frame);
      if (frames.filter((item) => item === HEARTBEAT_FRAME).length === 2) {
        state.running = false;
      }
    }
    const beats = frames.filter((item) => item === HEARTBEAT_FRAME);
    expect(beats).toHaveLength(2);
    expect(clock.now).toBeGreaterThanOrEqual(30_000);
    expect(frames.at(-1)).toBe(END_FRAME);
  });

  it("closes before the host's limit without saying end, so the browser reconnects", async () => {
    const { deps, clock } = harness();
    const frames = await collect(feedFrames(deps, 0));
    expect(frames).not.toContain(END_FRAME);
    expect(clock.now).toBeGreaterThanOrEqual(FEED_BUDGET_MS);
    expect(clock.now).toBeLessThan(FEED_BUDGET_MS + FEED_TICK_MS * 2);
    expect(FEED_BUDGET_MS).toBeLessThan(300_000);
  });

  it("stops when the reader goes away", async () => {
    const { deps, state } = harness({
      onSleep: () => {
        state.aborted = true;
      },
    });
    const frames = await collect(feedFrames(deps, 0));
    expect(frames).toEqual(["retry: 2000\n\n"]);
  });
});

describe("afterOf", () => {
  it("takes the header first, then the query, and otherwise starts at the beginning", () => {
    expect(afterOf("12", "3")).toBe(12);
    expect(afterOf(null, "3")).toBe(3);
    expect(afterOf("abc", "7")).toBe(7);
    expect(afterOf("-1", "1.5")).toBe(0);
    expect(afterOf(null, null)).toBe(0);
  });
});
