import { describe, expect, it } from "vitest";

import { runWithConcurrency } from "./pool";

/** These cases assert scheduling, not failure handling, so their `onError`
 * exists only to satisfy the contract. */
const ignoreError = (): void => {
  /* deliberately empty */
};

/** Records the highest number of workers ever in flight at once, which is
 * the property the whole module exists to guarantee — counting completions
 * would pass even for a fan-out that dispatched everything at once. */
const trackPeak = () => {
  const state = { inFlight: 0, peak: 0 };
  return {
    enter: () => {
      state.inFlight += 1;
      state.peak = Math.max(state.peak, state.inFlight);
    },
    leave: () => {
      state.inFlight -= 1;
    },
    get peak() {
      return state.peak;
    },
  };
};

const tick = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 1);
  });
};

describe("runWithConcurrency", () => {
  it("never runs more than the limit at once", async () => {
    const peak = trackPeak();
    await runWithConcurrency(
      Array.from({ length: 24 }, (_, i) => i),
      {
        limit: 3,
        onError: ignoreError,
        worker: async () => {
          peak.enter();
          await tick();
          peak.leave();
        },
      }
    );

    expect(peak.peak).toBe(3);
  });

  it("runs strictly one at a time at limit 1 — the setting that makes a latency comparable with its neighbours", async () => {
    const peak = trackPeak();
    await runWithConcurrency(
      Array.from({ length: 8 }, (_, i) => i),
      {
        limit: 1,
        onError: ignoreError,
        worker: async () => {
          peak.enter();
          await tick();
          peak.leave();
        },
      }
    );

    expect(peak.peak).toBe(1);
  });

  it("visits every item exactly once, in order, at limit 1", async () => {
    const seen: number[] = [];
    await runWithConcurrency([10, 20, 30, 40], {
      limit: 1,
      onError: ignoreError,
      worker: async (item) => {
        await tick();
        seen.push(item);
      },
    });

    expect(seen).toEqual([10, 20, 30, 40]);
  });

  it("hands work out from a shared cursor, so a slow item does not hold back the ones behind it", async () => {
    const finished: number[] = [];
    // Item 0 is the `gpt2` case: far slower than everything else. With
    // static partitioning it would block its whole slice.
    await runWithConcurrency([0, 1, 2, 3], {
      limit: 2,
      onError: ignoreError,
      worker: async (item) => {
        await new Promise((resolve) => {
          setTimeout(resolve, item === 0 ? 40 : 1);
        });
        finished.push(item);
      },
    });

    expect(finished).toEqual([1, 2, 3, 0]);
  });

  it("keeps going after a worker throws — at limit 1 an abandoned lane would strand the entire rest of the run", async () => {
    const done: number[] = [];
    const errors: number[] = [];
    await runWithConcurrency([1, 2, 3], {
      limit: 1,
      onError: (_error, item) => {
        errors.push(item);
      },
      worker: async (item) => {
        await tick();
        if (item === 2) {
          throw new Error("boom");
        }
        done.push(item);
      },
    });

    expect(done).toEqual([1, 3]);
    expect(errors).toEqual([2]);
  });

  it("reports the failure rather than swallowing it", async () => {
    const seen: unknown[] = [];
    await runWithConcurrency(["only"], {
      limit: 1,
      onError: (error) => {
        seen.push(error);
      },
      worker: async () => {
        await tick();
        throw new Error("boom");
      },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(Error);
  });

  it("degrades a nonsense limit to serial rather than dispatching nothing", async () => {
    const peak = trackPeak();
    await runWithConcurrency([1, 2, 3], {
      limit: 0,
      onError: ignoreError,
      worker: async () => {
        peak.enter();
        await tick();
        peak.leave();
      },
    });

    expect(peak.peak).toBe(1);
  });

  it("does nothing, and does not hang, on an empty run", async () => {
    let called = false;
    await runWithConcurrency([], {
      limit: 4,
      onError: ignoreError,
      worker: async () => {
        called = true;
        await tick();
      },
    });

    expect(called).toBe(false);
  });
});
