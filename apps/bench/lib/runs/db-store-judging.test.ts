/**
 * Unit tests for `db-store-judging.ts`'s DB-free comparative-pass helpers.
 * `resolveJudgeableUrls` and `judgeOnePairWithTelemetry` never call `getDb()`
 * — both take an already-injected `ComparativeJudge` and plain data, so these
 * tests open no Postgres connection and make no live fal call, same
 * discipline as `db-store.test.ts`'s header.
 *
 * These are the direct regression tests for two of the team lead's brief's
 * findings from a real 24-model sweep: pair calls left zero trace in the app
 * log, and the upload-per-sample design (already correct in
 * `resolveJudgeableUrls`, see its own header) had no test pinning it down.
 */
import type { JudgePair } from "@motif/bench-core/rank-judge";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  judgeOnePairWithTelemetry,
  resolveJudgeableUrls,
} from "./db-store-judging";
import type { RankableSample } from "./db-store-judging";
import type { ComparativeJudge, EnginePairJudgment } from "./engine";

/** Captures every `console.log` call as a plain `string[]`, sidestepping the
 * `any[]`-typed `Mock.calls` array `console.log`'s own signature produces
 * (which trips `no-unsafe-assignment` on a destructure). */
const captureLogLines = (): { lines: string[] } => {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(String(args[0]));
  });
  return { lines };
};

const unusedToJudgeableImageUrl: ComparativeJudge["toJudgeableImageUrl"] =
  // oxlint-disable-next-line require-await -- test stub must return a Promise to satisfy the seam but is never exercised
  async () => {
    throw new Error("not exercised by this test");
  };

describe("resolveJudgeableUrls", () => {
  it("uploads each sample exactly once — the reuse the pairing design depends on", async () => {
    const calls: string[] = [];
    const judge: ComparativeJudge = {
      // oxlint-disable-next-line require-await -- resolves synchronously, but the seam is async
      judgePair: async () => {
        throw new Error("not exercised by this test");
      },
      modelLabel: "test-judge",
      // oxlint-disable-next-line require-await -- resolves synchronously, but the seam is async
      toJudgeableImageUrl: async (imagePath) => {
        calls.push(imagePath);
        return `https://fal.media/files/${imagePath}`;
      },
    };
    const samples: readonly RankableSample[] = [
      { alias: "flux-fast", id: "s1", imagePath: "s1.png" },
      { alias: "grok-image", id: "s2", imagePath: "s2.png" },
      { alias: "seedream45", id: "s3", imagePath: "s3.png" },
    ];

    const urlBySample = await resolveJudgeableUrls(judge, samples);

    // A sample takes part in DEFAULT_COMPARISONS_PER_SAMPLE (6) pairs in a
    // real sweep (`@motif/bench-core/rank-judge`), but resolveJudgeableUrls
    // is keyed by sample, not by pair — exactly one upload call per sample,
    // regardless of how many comparisons reference it downstream.
    expect(calls).toHaveLength(samples.length);
    expect(new Set(calls).size).toBe(samples.length);
    expect(urlBySample.size).toBe(samples.length);
  });

  it("excludes, never throws for, a sample whose upload fails", async () => {
    const judge: ComparativeJudge = {
      // oxlint-disable-next-line require-await -- resolves synchronously, but the seam is async
      judgePair: async () => {
        throw new Error("not exercised by this test");
      },
      modelLabel: "test-judge",
      toJudgeableImageUrl: async (imagePath) => {
        if (imagePath === "bad.png") {
          throw new Error("upload failed");
        }
        return await Promise.resolve(`https://fal.media/files/${imagePath}`);
      },
    };
    const samples: readonly RankableSample[] = [
      { alias: "flux-fast", id: "s1", imagePath: "good.png" },
      { alias: "seedream45", id: "s2", imagePath: "bad.png" },
    ];

    const urlBySample = await resolveJudgeableUrls(judge, samples);

    expect(urlBySample.size).toBe(1);
    expect(urlBySample.has("s1")).toBe(true);
    expect(urlBySample.has("s2")).toBe(false);
  });
});

describe("judgeOnePairWithTelemetry", () => {
  const pair: JudgePair = { aSampleId: "s1", bSampleId: "s2" };
  const urlBySample = new Map([
    ["s1", "https://fal.media/files/a.jpg"],
    ["s2", "https://fal.media/files/b.jpg"],
  ]);
  const aliasBySample = new Map([
    ["s1", "flux-fast"],
    ["s2", "seedream45"],
  ]);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs one compact line — both aliases, outcome, duration — and returns the outcome", async () => {
    const { lines } = captureLogLines();
    const verdict: EnginePairJudgment = {
      criteria: null,
      critique: "b is sharper",
      errorCode: null,
      overall: "b",
      status: "judged",
      strength: "clear",
    };
    const judge: ComparativeJudge = {
      judgePair: async () => await Promise.resolve(verdict),
      modelLabel: "test-judge",
      toJudgeableImageUrl: unusedToJudgeableImageUrl,
    };

    const outcome = await judgeOnePairWithTelemetry(
      judge,
      pair,
      "compare these two rooms",
      urlBySample,
      aliasBySample
    );

    expect(outcome).toEqual({
      aSampleId: "s1",
      bSampleId: "s2",
      overall: "b",
      strength: "clear",
    });

    expect(lines).toHaveLength(1);
    const logged = lines[0] ?? "";
    expect(logged).toContain("flux-fast");
    expect(logged).toContain("seedream45");
    expect(logged).toContain("b:clear");
    expect(logged).toMatch(/\(\d+ms\)/u);
    // No prompt, no URL, no image data in the log line — BRIEF.md rule 3's
    // spirit, applied to logs the same way it already applies to spans.
    expect(logged).not.toContain("compare these two rooms");
    expect(logged).not.toContain("https://");
  });

  it("logs the failure code and excludes a failed pair — never throws, returns null", async () => {
    const { lines } = captureLogLines();
    const verdict: EnginePairJudgment = {
      criteria: null,
      critique: null,
      errorCode: "JUDGE_UNAVAILABLE",
      overall: null,
      status: "inconclusive",
      strength: null,
    };
    const judge: ComparativeJudge = {
      judgePair: async () => await Promise.resolve(verdict),
      modelLabel: "test-judge",
      toJudgeableImageUrl: unusedToJudgeableImageUrl,
    };

    const outcome = await judgeOnePairWithTelemetry(
      judge,
      pair,
      "compare these two rooms",
      urlBySample,
      aliasBySample
    );

    expect(outcome).toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines[0] ?? "").toContain("failed:JUDGE_UNAVAILABLE");
  });

  it("returns null without calling the judge when either sample has no resolved URL", async () => {
    const judgePairSpy = vi.fn<ComparativeJudge["judgePair"]>(() => {
      throw new Error("not exercised by this test");
    });
    const judge: ComparativeJudge = {
      judgePair: judgePairSpy,
      modelLabel: "test-judge",
      toJudgeableImageUrl: unusedToJudgeableImageUrl,
    };
    const missingUrl = new Map([["s1", "https://fal.media/files/a.jpg"]]);

    const outcome = await judgeOnePairWithTelemetry(
      judge,
      pair,
      "compare these two rooms",
      missingUrl,
      aliasBySample
    );

    expect(outcome).toBeNull();
    expect(judgePairSpy).not.toHaveBeenCalled();
  });
});
