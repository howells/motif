/**
 * Round-trip tests for the jsonb (de)serialization `db-store.ts` reads and
 * writes. Pure — no Postgres connection is opened anywhere in this file.
 *
 * The comparative pass needed no schema change, and these tests are what
 * pins that down: `bench_judgments.levels` is CHECK-constrained to a JSON
 * object and read back as `Record<string, string>`, so every value the rank
 * mapping writes must be a string.
 */
import { describe, expect, it } from "vitest";

import {
  fromLevelsJson,
  fromRankLevelsJson,
  toLevelsJson,
  toRankLevelsJson,
} from "./db-json";

const rankLevels = toRankLevelsJson({
  comparisons: 6,
  losses: 1,
  opponents: new Map([
    ["opponent-1", "win:clear"],
    ["opponent-2", "loss:slight"],
    ["opponent-3", "tie"],
  ]),
  rank: 3,
  rankedCount: 24,
  ties: 1,
  wins: 4,
});

describe("toRankLevelsJson", () => {
  it("writes only string values, as the levels column requires", () => {
    expect(
      Object.values(rankLevels).every((value) => typeof value === "string")
    ).toBe(true);
  });

  it("records the standings and every opponent outcome", () => {
    expect(rankLevels).toMatchObject({
      __comparisons: "6",
      __losses: "1",
      __of: "24",
      __rank: "3",
      __ties: "1",
      __wins: "4",
      "opponent-1": "win:clear",
      "opponent-2": "loss:slight",
      "opponent-3": "tie",
    });
  });

  it("keeps a rankless sample distinguishable from rank 0", () => {
    const levels = toRankLevelsJson({
      comparisons: 0,
      losses: 0,
      opponents: new Map(),
      rank: null,
      rankedCount: 24,
      ties: 0,
      wins: 0,
    });
    expect(levels.__rank).toBe("");
    expect(fromRankLevelsJson(levels).rank).toBeNull();
  });

  it("stays parseable by the shared levels reader", () => {
    const { errorCode, levels } = fromLevelsJson(rankLevels);
    expect(errorCode).toBeNull();
    expect(levels?.__rank).toBe("3");
  });
});

describe("fromRankLevelsJson", () => {
  it("round-trips the rank, the size of the ranked field, and the pair coverage counts", () => {
    expect(fromRankLevelsJson(rankLevels)).toStrictEqual({
      comparisons: 6,
      losses: 1,
      rank: 3,
      rankedCount: 24,
      ties: 1,
      wins: 4,
    });
  });

  it("degrades to nulls/zeros for a row with no rank standings", () => {
    expect(fromRankLevelsJson(toLevelsJson({ errorCode: null, levels: {} }))) //
      .toStrictEqual({
        comparisons: 0,
        losses: 0,
        rank: null,
        rankedCount: null,
        ties: 0,
        wins: 0,
      });
    expect(fromRankLevelsJson(null)).toStrictEqual({
      comparisons: 0,
      losses: 0,
      rank: null,
      rankedCount: null,
      ties: 0,
      wins: 0,
    });
  });

  it("rejects a non-positive rank rather than reporting #0", () => {
    expect(fromRankLevelsJson({ __of: "24", __rank: "0" }).rank).toBeNull();
    expect(fromRankLevelsJson({ __of: "24", __rank: "nope" }).rank).toBeNull();
  });

  it("treats an unparseable coverage count as zero, not a thrown error", () => {
    expect(fromRankLevelsJson({ __comparisons: "nope" }).comparisons).toBe(0);
    expect(fromRankLevelsJson({ __wins: "-1" }).wins).toBe(0);
  });
});
