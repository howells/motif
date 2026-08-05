/**
 * Unit tests for the comparative judge. Every one of these is pure: the
 * pairing plan and the Bradley-Terry solver take no client at all, and the
 * two `judgePair` tests inject a stub `PairJudgeModelClient`. No network call
 * is made anywhere in this file (`docs/arc/bench/BRIEF.md` rule 6, and the
 * team lead's hard constraint: no live fal calls).
 */
import { describe, expect, it } from "vitest";

import type { PairOutcome } from "./rank-judge";
import {
  assertJudgeableImageUrl,
  buildPairJudgePrompt,
  DEFAULT_COMPARISONS_PER_SAMPLE,
  judgePair,
  parsePairVerdictText,
  planPairings,
  RANK_RUBRIC_ID,
  RANK_RUBRIC_VERSION,
  rankSamples,
} from "./rank-judge";

const ids = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `sample-${index}`);

const pairKey = (pair: { aSampleId: string; bSampleId: string }): string =>
  [pair.aSampleId, pair.bSampleId].toSorted().join("|");

const degrees = (
  pairs: readonly { aSampleId: string; bSampleId: string }[]
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const pair of pairs) {
    counts.set(pair.aSampleId, (counts.get(pair.aSampleId) ?? 0) + 1);
    counts.set(pair.bSampleId, (counts.get(pair.bSampleId) ?? 0) + 1);
  }
  return counts;
};

/** A fully-ordered synthetic field: every sample beats every sample below it,
 * clearly. Bradley-Terry must recover exactly that order. */
const dominanceOutcomes = (order: readonly string[]): PairOutcome[] => {
  const outcomes: PairOutcome[] = [];
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      const better = order[i];
      const worse = order[j];
      if (better === undefined || worse === undefined) {
        continue;
      }
      outcomes.push({
        aSampleId: better,
        bSampleId: worse,
        overall: "a",
        strength: "clear",
      });
    }
  }
  return outcomes;
};

const stubPairClient = (text: string) => ({
  generatePairJudgeText: async () => await Promise.resolve(text),
});

const URL_A = "https://cdn.example.com/a.png";
const URL_B = "https://cdn.example.com/b.png";

describe("planPairings — determinism", () => {
  it("returns an identical plan for the same samples and seed", () => {
    const first = planPairings(ids(24), { seed: 4242 });
    const second = planPairings(ids(24), { seed: 4242 });
    expect(second).toStrictEqual(first);
  });

  it("returns a different plan for a different seed", () => {
    const first = planPairings(ids(24), { seed: 1 });
    const second = planPairings(ids(24), { seed: 2 });
    expect(new Set(first.map(pairKey))).not.toStrictEqual(
      new Set(second.map(pairKey))
    );
  });

  it("never calls Math.random — a stubbed Math.random cannot change the plan", () => {
    const original = Math.random;
    const before = planPairings(ids(12), { seed: 7 });
    Math.random = () => 0.5;
    try {
      expect(planPairings(ids(12), { seed: 7 })).toStrictEqual(before);
    } finally {
      Math.random = original;
    }
  });
});

describe("planPairings — coverage", () => {
  it("gives every sample exactly K comparisons for N=24, K=6 (72 pairs)", () => {
    const pairs = planPairings(ids(24), {
      comparisonsPerSample: DEFAULT_COMPARISONS_PER_SAMPLE,
      seed: 99,
    });
    expect(pairs).toHaveLength(72);
    const counts = degrees(pairs);
    expect(counts.size).toBe(24);
    expect([...counts.values()].every((count) => count === 6)).toBe(true);
  });

  it("never repeats a pair", () => {
    const pairs = planPairings(ids(24), { seed: 99 });
    expect(new Set(pairs.map(pairKey)).size).toBe(pairs.length);
  });

  it("never pairs a sample with itself", () => {
    const pairs = planPairings(ids(17), { seed: 3 });
    expect(pairs.every((pair) => pair.aSampleId !== pair.bSampleId)).toBe(true);
  });

  it("balances the A and B positions across the field", () => {
    const pairs = planPairings(ids(24), { seed: 11 });
    const asA = new Map<string, number>();
    for (const pair of pairs) {
      asA.set(pair.aSampleId, (asA.get(pair.aSampleId) ?? 0) + 1);
    }
    expect([...asA.values()].every((count) => count === 3)).toBe(true);
  });

  it("falls back to all pairs when K would cover the whole field anyway", () => {
    const pairs = planPairings(ids(5), { comparisonsPerSample: 6, seed: 1 });
    expect(pairs).toHaveLength(10); // 5 * 4 / 2
    expect([...degrees(pairs).values()].every((count) => count === 4)).toBe(
      true
    );
  });

  it("reduces K by one when K x N is odd (no odd-regular graph exists)", () => {
    const pairs = planPairings(ids(7), { comparisonsPerSample: 3, seed: 5 });
    expect([...degrees(pairs).values()].every((count) => count === 2)).toBe(
      true
    );
  });

  it("supports an odd K on an even field via the perfect matching", () => {
    const pairs = planPairings(ids(8), { comparisonsPerSample: 3, seed: 5 });
    expect(pairs).toHaveLength(12); // 8 * 3 / 2
    expect([...degrees(pairs).values()].every((count) => count === 3)).toBe(
      true
    );
    expect(new Set(pairs.map(pairKey)).size).toBe(pairs.length);
  });

  it("returns no pairs for fewer than two samples", () => {
    expect(planPairings([], { seed: 1 })).toStrictEqual([]);
    expect(planPairings(["only"], { seed: 1 })).toStrictEqual([]);
    expect(planPairings(["dup", "dup"], { seed: 1 })).toStrictEqual([]);
  });

  it("handles the smallest real comparison — two samples, one pair", () => {
    const pairs = planPairings(["a", "b"], { seed: 1 });
    expect(pairs).toHaveLength(1);
  });
});

describe("parsePairVerdictText", () => {
  const full = JSON.stringify({
    artifacts: "A",
    critique: "A is cleaner.",
    lightingCoherence: "A",
    materialFidelity: "tie",
    overall: "A",
    photorealism: "B",
    promptAdherence: "A",
    spatialPlausibility: "tie",
    strength: "clear",
  });

  it("parses a clean verdict", () => {
    const verdict = parsePairVerdictText(full);
    expect(verdict?.overall).toBe("a");
    expect(verdict?.strength).toBe("clear");
    expect(verdict?.criteria.photorealism).toBe("b");
    expect(verdict?.criteria.materialFidelity).toBe("tie");
  });

  it("parses through a markdown fence and a preamble", () => {
    const verdict = parsePairVerdictText(
      `Here is my answer:\n\`\`\`json\n${full}\n\`\`\`\n`
    );
    expect(verdict?.overall).toBe("a");
  });

  it("normalises verbose winner phrasings", () => {
    const verdict = parsePairVerdictText(
      JSON.stringify({ overall: "Image B", strength: "decisive" })
    );
    expect(verdict?.overall).toBe("b");
    expect(verdict?.strength).toBe("clear");
  });

  it("defaults an unrecognised or missing winner to tie, never a fabricated win", () => {
    const verdict = parsePairVerdictText(JSON.stringify({ critique: "hmm" }));
    expect(verdict?.overall).toBe("tie");
    expect(verdict?.criteria.promptAdherence).toBe("tie");
  });

  it("forces strength to tie whenever the overall winner is a tie", () => {
    const verdict = parsePairVerdictText(
      JSON.stringify({ overall: "tie", strength: "clear" })
    );
    expect(verdict?.strength).toBe("tie");
  });

  it("defaults an unparseable strength to slight, the weaker claim", () => {
    const verdict = parsePairVerdictText(
      JSON.stringify({ overall: "A", strength: "???" })
    );
    expect(verdict?.strength).toBe("slight");
  });

  it("returns null when there is no JSON object at all", () => {
    expect(parsePairVerdictText("A is better, obviously.")).toBeNull();
  });
});

describe("rankSamples — Bradley-Terry", () => {
  it("recovers a known synthetic ordering", () => {
    const order = ["best", "second", "third", "fourth", "worst"];
    const result = rankSamples(
      [...order].toReversed(),
      dominanceOutcomes(order)
    );
    const byId = new Map(result.samples.map((s) => [s.sampleId, s]));
    expect(order.map((id) => byId.get(id)?.rank)).toStrictEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(result.rankedCount).toBe(5);
  });

  it("normalises the mean strength of the ranked field to 1", () => {
    const order = ["a", "b", "c", "d"];
    const result = rankSamples(order, dominanceOutcomes(order));
    const scores = result.samples.map((s) => s.rankScore ?? 0);
    const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    expect(mean).toBeCloseTo(1, 6);
  });

  it("keeps an undefeated sample's strength finite", () => {
    const result = rankSamples(
      ["a", "b", "c"],
      [
        { aSampleId: "a", bSampleId: "b", overall: "a", strength: "clear" },
        { aSampleId: "a", bSampleId: "c", overall: "a", strength: "clear" },
        { aSampleId: "b", bSampleId: "c", overall: "b", strength: "clear" },
      ]
    );
    const top = result.samples.find((s) => s.sampleId === "a");
    expect(Number.isFinite(top?.rankScore ?? Number.NaN)).toBe(true);
    expect(top?.rank).toBe(1);
  });

  it("treats an all-tie field as equal strengths", () => {
    const result = rankSamples(
      ["a", "b", "c"],
      [
        { aSampleId: "a", bSampleId: "b", overall: "tie", strength: "tie" },
        { aSampleId: "b", bSampleId: "c", overall: "tie", strength: "tie" },
        { aSampleId: "a", bSampleId: "c", overall: "tie", strength: "tie" },
      ]
    );
    for (const sample of result.samples) {
      expect(sample.rankScore).toBeCloseTo(1, 6);
      expect(sample.ties).toBe(2);
      expect(sample.wins).toBe(0);
      expect(sample.losses).toBe(0);
    }
  });

  it("ranks a slight win below a clear win of the same shape", () => {
    const clear = rankSamples(
      ["a", "b"],
      [{ aSampleId: "a", bSampleId: "b", overall: "a", strength: "clear" }]
    );
    const slight = rankSamples(
      ["a", "b"],
      [{ aSampleId: "a", bSampleId: "b", overall: "a", strength: "slight" }]
    );
    const clearTop = clear.samples.find((s) => s.sampleId === "a")?.rankScore;
    const slightTop = slight.samples.find((s) => s.sampleId === "a")?.rankScore;
    expect(clearTop ?? 0).toBeGreaterThan(slightTop ?? 0);
  });

  it("gives a sample with zero comparisons a null score and a null rank", () => {
    const result = rankSamples(
      ["a", "b", "lonely"],
      [{ aSampleId: "a", bSampleId: "b", overall: "a", strength: "clear" }]
    );
    const lonely = result.samples.find((s) => s.sampleId === "lonely");
    expect(lonely?.rankScore).toBeNull();
    expect(lonely?.rank).toBeNull();
    expect(lonely?.comparisons).toBe(0);
    expect(result.rankedCount).toBe(2);
  });

  it("counts wins, losses and ties per sample", () => {
    const result = rankSamples(
      ["a", "b", "c"],
      [
        { aSampleId: "a", bSampleId: "b", overall: "a", strength: "clear" },
        { aSampleId: "c", bSampleId: "a", overall: "a", strength: "slight" },
        { aSampleId: "a", bSampleId: "c", overall: "tie", strength: "tie" },
      ]
    );
    const a = result.samples.find((s) => s.sampleId === "a");
    expect(a).toMatchObject({ comparisons: 3, losses: 1, ties: 1, wins: 1 });
  });

  it("ignores an outcome naming a sample outside the run", () => {
    const result = rankSamples(
      ["a", "b"],
      [{ aSampleId: "a", bSampleId: "ghost", overall: "a", strength: "clear" }]
    );
    expect(result.rankedCount).toBe(0);
    expect(result.samples.every((s) => s.rankScore === null)).toBe(true);
  });

  it("returns an empty ranked field when there are no outcomes at all", () => {
    const result = rankSamples(["a", "b"], []);
    expect(result.rankedCount).toBe(0);
    expect(result.samples.map((s) => s.rank)).toStrictEqual([null, null]);
  });
});

describe("judgePair — the injected seam", () => {
  it("judges a pair through the stub client", async () => {
    const result = await judgePair(
      stubPairClient(JSON.stringify({ overall: "B", strength: "slight" })),
      { imageUrlA: URL_A, imageUrlB: URL_B, prompt: "a room" }
    );
    expect(result).toMatchObject({
      rubricId: RANK_RUBRIC_ID,
      rubricVersion: RANK_RUBRIC_VERSION,
      status: "judged",
      verdict: { overall: "b", strength: "slight" },
    });
  });

  it("refuses a data: URI rather than forwarding it (BRIEF.md rule 1)", async () => {
    const result = await judgePair(stubPairClient("{}"), {
      imageUrlA: "data:image/png;base64,iVBORw0KGgo=",
      imageUrlB: URL_B,
      prompt: "a room",
    });
    expect(result).toStrictEqual({
      errorCode: "IMAGE_READ_FAILED",
      status: "inconclusive",
    });
  });

  it("reports a dead judge as inconclusive rather than throwing", async () => {
    const result = await judgePair(
      {
        generatePairJudgeText: async () => {
          await Promise.resolve();
          throw new Error("upstream exploded");
        },
      },
      { imageUrlA: URL_A, imageUrlB: URL_B, prompt: "a room" }
    );
    expect(result).toStrictEqual({
      errorCode: "JUDGE_UNAVAILABLE",
      status: "inconclusive",
    });
  });

  it("reports an abort as TIMEOUT", async () => {
    const result = await judgePair(
      {
        generatePairJudgeText: async () => {
          await Promise.resolve();
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          throw error;
        },
      },
      { imageUrlA: URL_A, imageUrlB: URL_B, prompt: "a room" }
    );
    expect(result).toStrictEqual({
      errorCode: "TIMEOUT",
      status: "inconclusive",
    });
  });

  it("reports unparseable output as INVALID_VERDICT", async () => {
    const result = await judgePair(stubPairClient("no json here"), {
      imageUrlA: URL_A,
      imageUrlB: URL_B,
      prompt: "a room",
    });
    expect(result).toStrictEqual({
      errorCode: "INVALID_VERDICT",
      status: "inconclusive",
    });
  });
});

describe("blindness and the base64 rule", () => {
  it("builds a prompt that names neither model nor cost", () => {
    const prompt = buildPairJudgePrompt("a sunlit reading room");
    expect(prompt).toContain("a sunlit reading room");
    expect(prompt).toContain('the FIRST image is "A"');
    expect(prompt).not.toMatch(/flux|seedream|gemini|\$|usd|price/iu);
  });

  it("rejects any non-http(s) image reference", () => {
    expect(() => {
      assertJudgeableImageUrl("data:image/png;base64,AAAA");
    }).toThrow(/http/iu);
    expect(() => {
      assertJudgeableImageUrl("/var/live-runs/a.png");
    }).toThrow(/http/iu);
    expect(() => {
      assertJudgeableImageUrl("https://cdn.example.com/a.png");
    }).not.toThrow();
  });
});
