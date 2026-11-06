import { describe, expect, it } from "vitest";

import type { WorkerEvent } from "../tasks/execute";
import {
  ELAPSED_EVERY_MS,
  MAX_LOG_LINES,
  Narrator,
  Waiting,
  typicalLine,
} from "./run-voice";
import type { Line } from "./run-voice";

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
