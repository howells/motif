import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { SPEND_KEY, afterSettle, justSettled } from "./settled";

const SPEND = {
  capMicros: 50_000_000,
  leftMicros: 50_000_000,
  mine: { estimated: 0, heldMicros: 100_000, runs: 1, spentMicros: 0 },
  month: "2026-11",
  pot: null,
};

describe(justSettled, () => {
  it("fires only when a running run stops", () => {
    expect(justSettled(true, false)).toBe(true);
    expect(justSettled(true, true)).toBe(false);
    expect(justSettled(false, false)).toBe(false);
    expect(justSettled(false, true)).toBe(false);
  });
});

describe(afterSettle, () => {
  it("refetches the spend meter and the Library, then redraws the rail", async () => {
    const client = new QueryClient();
    const settled = {
      ...SPEND,
      mine: { ...SPEND.mine, heldMicros: 0, spentMicros: 80_000 },
    };
    let calls = 0;
    // The meter on screen watches the spend as `useQuery` would, starting
    // from what the server drew.
    const meter = new QueryObserver(client, {
      initialData: SPEND,
      queryFn: async () => {
        calls += 1;
        return await Promise.resolve(settled);
      },
      queryKey: [...SPEND_KEY],
      staleTime: Infinity,
    });
    let redraws = 0;
    const stop = meter.subscribe(() => {
      redraws += 1;
    });
    client.setQueryData(["library", "stacks"], { images: 0, stacks: [] });
    expect(meter.getCurrentResult().data).toStrictEqual(SPEND);
    let refreshed = 0;

    await afterSettle(client, () => {
      refreshed += 1;
    });

    expect({ calls, redrawn: redraws > 0 }).toStrictEqual({
      calls: 1,
      redrawn: true,
    });
    expect(meter.getCurrentResult().data).toStrictEqual(settled);
    expect(client.getQueryState(["library", "stacks"])?.isInvalidated).toBe(
      true
    );
    expect(refreshed).toBe(1);
    stop();
  });
});
