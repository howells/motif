import type { AppRow, AppSql } from "@motif/bench-db/app-sql";
import { describe, expect, it } from "vitest";

import {
  HISTORY,
  MIN_SAMPLES,
  medianOf,
  typicalDurationMs,
} from "./run-timing";

const OWNER = "mem_0123456789abcdef0123456789abcdef";

const answering = (rows: readonly AppRow[]) => {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  const sql: AppSql = async (text, values) => {
    await Promise.resolve();
    calls.push({ text, values });
    return rows;
  };
  return { calls, sql };
};

const ms = (...values: (number | string)[]): AppRow[] =>
  values.map((value) => ({ provider_ms: value }));

describe("medianOf", () => {
  it("is the middle value, and the mean of the middle two when even", () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf([5])).toBe(5);
    expect(medianOf([9, 1, 5])).toBe(5);
    expect(medianOf([40_000, 60_000, 52_000, 48_000])).toBe(50_000);
  });

  it("is not moved by one slow run", () => {
    expect(medianOf([48_000, 50_000, 51_000, 300_000, 49_000])).toBe(50_000);
  });
});

describe("typicalDurationMs", () => {
  it("reads this owner's last twenty finished runs of the Model, in one bounded statement", async () => {
    const { calls, sql } = answering(ms(50_000, 52_000, 48_000));
    await typicalDurationMs(sql, OWNER, "grok-image");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("owner_id = $1");
    expect(calls[0]?.text).toContain("status = 'completed'");
    expect(calls[0]?.text).toContain("LIMIT $3");
    expect(calls[0]?.values).toStrictEqual([OWNER, "grok-image", HISTORY]);
    expect(HISTORY).toBe(20);
  });

  it("is the median of what it reads, however the driver spells the integers", async () => {
    const { sql } = answering(ms(50_000, "52000", 48_000));
    await expect(typicalDurationMs(sql, OWNER, "grok-image")).resolves.toBe(
      50_000
    );
  });

  it("says nothing without enough history to say 'usually'", async () => {
    const { sql } = answering(ms(50_000, 52_000));
    expect(MIN_SAMPLES).toBe(3);
    await expect(
      typicalDurationMs(sql, OWNER, "grok-image")
    ).resolves.toBeNull();
    await expect(
      typicalDurationMs(answering([]).sql, OWNER, "grok-image")
    ).resolves.toBeNull();
  });
});
