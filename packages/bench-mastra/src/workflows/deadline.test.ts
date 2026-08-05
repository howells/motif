import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { raceDeadline } from "./deadline";

/** A work function that never settles on its own — only `raceDeadline`'s own
 * timeout can resolve the outer promise. */
const hangs = async (): Promise<string> =>
  await new Promise<string>(() => {
    // Intentionally never resolves or rejects.
  });

describe("raceDeadline", () => {
  it("resolves with the work's value when it finishes before the deadline", async () => {
    const outcome = await raceDeadline(
      async () => {
        await delay(5);
        return "done";
      },
      undefined,
      1000
    );

    expect(outcome.timedOut).toBe(false);
    expect(!outcome.timedOut && outcome.value).toBe("done");
  });

  it("times out using fallbackMs when deadlineAt is undefined", async () => {
    const outcome = await raceDeadline(hangs, undefined, 15);

    expect(outcome.timedOut).toBe(true);
    expect(outcome.elapsedMs).toBeGreaterThanOrEqual(10);
  });

  it("aborts the work's signal when the deadline fires", async () => {
    let sawAbort = false;
    await raceDeadline(
      async (signal) => {
        await new Promise<void>(() => {
          signal.addEventListener("abort", () => {
            sawAbort = true;
          });
          // Never resolves on its own — only the timeout should settle this.
        });
      },
      undefined,
      10
    );

    expect(sawAbort).toBe(true);
  });

  it("races the remainder of an already-set deadline rather than a fresh fallback", async () => {
    const deadlineAt = Date.now() + 10;
    const outcome = await raceDeadline(
      hangs,
      deadlineAt,
      // A much larger fallback that would never fire in time for this test —
      // proves the deadline's remainder wins, not fallbackMs.
      10_000
    );

    expect(outcome.timedOut).toBe(true);
  });

  it("never produces an unhandled rejection when work rejects after the deadline wins", async () => {
    const outcome = await raceDeadline(
      async () =>
        await new Promise<string>((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error("late failure"));
          }, 20);
        }),
      undefined,
      5
    );

    expect(outcome.timedOut).toBe(true);
    // Give the late rejection a chance to fire; if it were unhandled, vitest's
    // process-level handler would fail this test run.
    await delay(30);
  });
});
