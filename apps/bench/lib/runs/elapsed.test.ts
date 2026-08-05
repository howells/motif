import { describe, expect, it } from "vitest";

import { elapsedMsFor } from "./elapsed";

const AT = new Date("2026-08-05T12:00:00.000Z");
const NOW = AT.getTime() + 4200;

describe("elapsedMsFor", () => {
  it("counts from dispatch, not from when the row was written", () => {
    expect(elapsedMsFor({ now: NOW, startedAt: AT, status: "pending" })).toBe(
      4200
    );
  });

  it("returns null for a sample that has not been dispatched — every sample of a run is inserted in one batch, so an undispatched one must show nothing rather than the whole run's age", () => {
    expect(
      elapsedMsFor({ now: NOW, startedAt: null, status: "pending" })
    ).toBeNull();
  });

  it("stops at settlement: a completed sample reports its measured providerMs, and a second longer duration for the same event would be unreadable", () => {
    expect(
      elapsedMsFor({ now: NOW, startedAt: AT, status: "completed" })
    ).toBeNull();
  });

  it("stops on failure too", () => {
    expect(
      elapsedMsFor({ now: NOW, startedAt: AT, status: "failed" })
    ).toBeNull();
  });

  it("clamps a start instant in the future to zero rather than rendering a negative stopwatch — the dispatching instance and the polling instance are not the same clock", () => {
    expect(
      elapsedMsFor({
        now: AT.getTime() - 900,
        startedAt: AT,
        status: "pending",
      })
    ).toBe(0);
  });
});
