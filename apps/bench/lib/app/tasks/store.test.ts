import type { AppRow } from "@motif/bench-db/app-sql";
import { describe, expect, it, vi } from "vitest";

import { MONTHLY_CAP_MICROS } from "../budget/policy";
import { endGeneration, reserveRuns } from "./store";
import type { PlannedRun } from "./store";

const run = (overrides: Partial<PlannedRun> = {}): PlannedRun => ({
  boundMicros: 221_250,
  comparisonId: null,
  endpoint: "fal-ai/banana2",
  holdId: `hld_${"1".repeat(32)}`,
  id: `gen_${"1".repeat(32)}`,
  idempotencyKey: "key-1",
  input: { task: "generate" },
  maskAssetId: null,
  mode: null,
  model: "banana2",
  ownerId: `mem_${"1".repeat(32)}`,
  parentId: null,
  prompt: "x",
  referenceAssetIds: [],
  retryOf: null,
  sourceAssetId: null,
  stackId: `gen_${"1".repeat(32)}`,
  task: "generate",
  tier: "balanced",
  ...overrides,
});

const sqlAnswering = (reserve: AppRow[] | Error, rest: AppRow[] = []) =>
  vi.fn(
    async (
      text: string,
      _values: readonly unknown[]
    ): Promise<readonly AppRow[]> => {
      if (text.includes("WITH req AS")) {
        if (reserve instanceof Error) {
          throw reserve;
        }
        return reserve;
      }
      return rest;
    }
  );

const AT = new Date("2026-10-15T12:00:00Z");

describe("reserveRuns", () => {
  it("refuses a zero, fractional or unsafe hold without touching the database", async () => {
    const sql = sqlAnswering([]);
    for (const boundMicros of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
      await expect(
        reserveRuns(sql, [run({ boundMicros })], null, AT)
      ).rejects.toThrow(RangeError);
    }
    expect(sql).not.toHaveBeenCalled();
  });

  it("reserves every run in one statement, checked against the cap for the month", async () => {
    const sql = sqlAnswering([
      { comparisons: 0, duplicate_ids: [], generation_ids: [run().id] },
    ]);
    await expect(reserveRuns(sql, [run()], null, AT)).resolves.toStrictEqual({
      generationIds: [run().id],
      kind: "reserved",
    });
    const reserve = sql.mock.calls.find(([text]) =>
      text.includes("jsonb_to_recordset")
    );
    expect(reserve?.[1]).toStrictEqual([
      "2026-10",
      expect.any(String),
      null,
      MONTHLY_CAP_MICROS,
    ]);
    expect(reserve?.[0]).toMatch(
      /spent_micros \+ b\.held_micros \+ \(SELECT micros FROM total\)\s+<= COALESCE/u
    );
    expect(reserve?.[0]).toContain("NOT EXISTS (SELECT 1 FROM dup)");
  });

  it("returns the earlier runs for a repeated press instead of holding again", async () => {
    const sql = sqlAnswering([
      { comparisons: 0, duplicate_ids: ["gen_old"], generation_ids: [] },
    ]);
    await expect(reserveRuns(sql, [run()], null, AT)).resolves.toStrictEqual({
      generationIds: ["gen_old"],
      kind: "duplicate",
    });
  });

  it("treats a race on the idempotency key as the same press", async () => {
    const race = Object.assign(new Error("duplicate key"), { code: "23505" });
    const sql = sqlAnswering(race, [{ id: "gen_winner" }]);
    await expect(reserveRuns(sql, [run()], null, AT)).resolves.toStrictEqual({
      generationIds: ["gen_winner"],
      kind: "duplicate",
    });
    expect(sql).toHaveBeenLastCalledWith(expect.any(String), [
      JSON.stringify([
        { idempotency_key: run().idempotencyKey, owner_id: run().ownerId },
      ]),
    ]);
  });

  it("doesn't hide an unrelated unique constraint failure as a duplicate press", async () => {
    const collision = Object.assign(new Error("duplicate record id"), {
      code: "23505",
    });
    await expect(
      reserveRuns(sqlAnswering(collision), [run()], null, AT)
    ).rejects.toBe(collision);
  });

  it("reports what's left under the cap when nothing could be held", async () => {
    const sql = sqlAnswering(
      [{ comparisons: 0, duplicate_ids: [], generation_ids: [] }],
      [{ available_micros: "100000" }]
    );
    await expect(
      reserveRuns(
        sql,
        [run(), run({ holdId: "h2", id: "g2", idempotencyKey: "k2" })],
        null,
        AT
      )
    ).resolves.toStrictEqual({
      availableMicros: 100_000,
      kind: "cap",
      requestedMicros: 442_500,
    });
  });
});

describe("endGeneration", () => {
  it("refuses a negative or fractional cost", async () => {
    const sql = sqlAnswering([]);
    await expect(
      endGeneration(sql, "g", ["submitted"], {
        cost: { basis: "", kind: "settled", micros: -1 },
        status: "completed",
      })
    ).rejects.toThrow(RangeError);
    await expect(
      endGeneration(sql, "g", ["submitted"], {
        cost: { basis: "", kind: "settled", micros: 0.5 },
        status: "completed",
      })
    ).rejects.toThrow(RangeError);
    expect(sql).not.toHaveBeenCalled();
  });

  it("ends only from the states named, and moves held into spent in the same statement", async () => {
    const sql = sqlAnswering([], [{ ended: 1 }]);
    await expect(
      endGeneration(sql, "g", ["submitting", "submitted"], {
        cost: { basis: "projected", kind: "settled", micros: 150_001 },
        status: "completed",
      })
    ).resolves.toBe(true);
    const [text, values] = sql.mock.calls[0] ?? ["", []];
    expect(values.slice(0, 5)).toStrictEqual([
      "g",
      ["submitting", "submitted"],
      "completed",
      "settled",
      150_001,
    ]);
    expect(text).toContain("status = ANY($2::text[])");
    expect(text).toContain(
      "held_micros = held_micros - CASE WHEN h.prev_status = 'held'"
    );
    expect(text).toContain(
      "spent_micros = spent_micros + h.settled_micros - h.prev_settled"
    );
  });

  it("reports a Generation already ended elsewhere", async () => {
    await expect(
      endGeneration(sqlAnswering([], [{ ended: 0 }]), "g", ["reserved"], {
        cost: { basis: "", kind: "released" },
        status: "failed",
      })
    ).resolves.toBe(false);
  });
});
