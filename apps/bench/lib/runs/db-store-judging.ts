/**
 * The judging half of `db-store.ts`'s write path — split into its own file
 * purely to keep `db-store.ts` under the repo's line budget (`oxlint`'s
 * `max-lines`); this is still part of the same Postgres store, not a
 * separate seam. `repository.ts` never imports from here directly — it
 * calls `db-store.ts`'s re-exported `startJudging`, which is the only
 * function `db-store.ts` (via `finalizeRunIfDone`) also calls internally.
 *
 * Same lazy-`@motif/bench-db/client`-import discipline as `db-store.ts` —
 * see that file's header for why a static import would break the zero-env
 * `next build` gate.
 */
import { randomUUID } from "node:crypto";

import { ROOM_RUBRIC_ID, ROOM_RUBRIC_VERSION } from "@motif/bench-core/judge";
import type { JudgePair, PairOutcome } from "@motif/bench-core/rank-judge";
import {
  planPairings,
  RANK_RUBRIC_ID,
  RANK_RUBRIC_VERSION,
  rankSamples,
} from "@motif/bench-core/rank-judge";
import { benchJudgments, benchRuns, benchSamples } from "@motif/bench-db";
import type { BenchDb } from "@motif/bench-db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { RunSpecJsonSchema, toLevelsJson, toRankLevelsJson } from "./db-json";
import type { ComparativeJudge, EnginePairJudgment, RunEngine } from "./engine";
import { hashUnit } from "./mock-engine";
import type { JudgingStatus } from "./types";

const getDb = async (): Promise<BenchDb> => {
  // oxlint-disable-next-line howells/no-runtime-dynamic-imports -- deliberate lazy boundary, see db-store.ts's header
  const { db } = await import("@motif/bench-db/client");
  return db();
};

const runDetached = (label: string, task: () => Promise<void>): void => {
  void (async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[bench db-store-judging] ${label} failed`, error);
    }
  })();
};

/** Guarded write of just the `judgingStatus` key inside `spec` — compares
 * the current value in the same statement so two racing transitions can't
 * stomp each other; the loser's `UPDATE` matches zero rows and is a no-op. */
const setJudgingStatus = async (
  db: BenchDb,
  runId: string,
  expectedCurrent: JudgingStatus,
  next: JudgingStatus
): Promise<boolean> => {
  const updated = await db
    .update(benchRuns)
    .set({
      spec: sql`jsonb_set(${benchRuns.spec}, '{judgingStatus}', to_jsonb(${next}::text))`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(benchRuns.id, runId),
        sql`${benchRuns.spec} ->> 'judgingStatus' = ${expectedCurrent}`
      )
    )
    .returning({ id: benchRuns.id });
  return updated.length > 0;
};

const markJudgingDoneIfSettled = async (runId: string): Promise<void> => {
  const db = await getDb();
  const completedSamples = await db
    .select({ id: benchSamples.id })
    .from(benchSamples)
    .where(
      and(eq(benchSamples.runId, runId), eq(benchSamples.status, "completed"))
    );
  if (completedSamples.length === 0) {
    return;
  }

  const judged = await db
    .select({ sampleId: benchJudgments.sampleId })
    .from(benchJudgments)
    .where(
      inArray(
        benchJudgments.sampleId,
        completedSamples.map((s) => s.id)
      )
    );
  const judgedIds = new Set(judged.map((j) => j.sampleId));
  const allJudged = completedSamples.every((s) => judgedIds.has(s.id));
  if (!allJudged) {
    return;
  }

  await setJudgingStatus(db, runId, "running", "done");
};

const judgeOneSample = async (
  runId: string,
  sampleId: string,
  modelAlias: string,
  imagePath: string | null,
  prompt: string,
  judgeModel: string,
  engine: RunEngine
): Promise<void> => {
  const db = await getDb();
  const verdict = await engine.buildJudgment({
    alias: modelAlias,
    imagePath,
    prompt,
    sampleId,
  });
  const levels = toLevelsJson(verdict);

  await db
    .insert(benchJudgments)
    .values({
      costMicros: verdict.costMicros,
      critique: verdict.critique,
      id: randomUUID(),
      judgeModel,
      levels,
      overall: verdict.overall,
      rubricId: ROOM_RUBRIC_ID,
      rubricVersion: ROOM_RUBRIC_VERSION,
      sampleId,
      status: verdict.status,
    })
    .onConflictDoUpdate({
      set: {
        costMicros: verdict.costMicros,
        critique: verdict.critique,
        levels,
        overall: verdict.overall,
        status: verdict.status,
        updatedAt: new Date(),
      },
      target: [
        benchJudgments.sampleId,
        benchJudgments.judgeModel,
        benchJudgments.rubricId,
        benchJudgments.rubricVersion,
      ],
    });

  await markJudgingDoneIfSettled(runId);
};

// ---------------------------------------------------------------------------
// Comparative pass — pairwise A/B + Bradley-Terry
// ---------------------------------------------------------------------------

/** How many pair judgments are in flight at once. Deliberately small: the
 * headline numbers this benchmark reports are latency numbers, and while
 * judging does not itself contend with generation (the run is already
 * finished by the time judging starts), the fal account is shared with any
 * concurrent run, so a 72-call sweep must not monopolise it. `BRIEF.md`
 * rule 7's spirit — the trustworthy default over the fast one. */
const JUDGE_PAIR_CONCURRENCY = 4;

export interface RankableSample {
  /** Logged alongside every pair-telemetry line (`judgeOnePairWithTelemetry`
   * below) so a failure trace can be read back to a specific model without
   * a join — never forwarded to the judge itself, which stays blind to
   * model identity (`@motif/bench-core/rank-judge`'s header). */
  readonly alias: string;
  readonly id: string;
  readonly imagePath: string;
}

/** A bounded worker pool over `items`. Results come back in input order —
 * which matters here because the pairing plan is deterministic and the
 * outcome list feeding Bradley-Terry must be too. `cursor` is safe without a
 * lock: the read-and-increment is synchronous, and JavaScript never
 * interleaves two synchronous statements. */
const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<(R | null)[]> => {
  const results: (R | null)[] = items.map(() => null);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        if (item === undefined) {
          return;
        }
        results[index] = await worker(item);
      }
    })
  );
  return results;
};

/**
 * Uploads each sample's image to fal's CDN **once** and returns the URL map.
 * This is the reuse the pairing design depends on: a sample takes part in K
 * comparisons, so uploading per pair would repeat the same bytes K−1 times.
 * (The generation path cannot supply these URLs — fal's own generation URLs
 * expire, which is exactly why `execute.ts` downloads the image before the
 * row lands, `BRIEF.md`.) A sample whose upload fails is simply left out of
 * the map, and therefore out of the pairing plan — it is never fatal.
 */
export const resolveJudgeableUrls = async (
  judge: ComparativeJudge,
  samples: readonly RankableSample[]
): Promise<Map<string, string>> => {
  const entries = await mapWithConcurrency(
    samples,
    JUDGE_PAIR_CONCURRENCY,
    async (sample): Promise<readonly [string, string] | null> => {
      try {
        return [sample.id, await judge.toJudgeableImageUrl(sample.imagePath)];
      } catch (error) {
        console.error(
          `[bench db-store-judging] judge image upload failed for sample ${sample.id}`,
          error
        );
        return null;
      }
    }
  );
  return new Map(entries.filter((entry) => entry !== null));
};

/** `judged` status plus non-null `overall`/`strength` is the exact condition
 * `runComparativePass` already used inline to decide whether a pair verdict
 * becomes an `outcome` — split out so `judgeOnePairWithTelemetry` and its
 * log line agree with the aggregation step on what "succeeded" means. */
const pairOutcomeFrom = (
  pair: JudgePair,
  judgment: EnginePairJudgment
): PairOutcome | null =>
  judgment.status === "judged" &&
  judgment.overall !== null &&
  judgment.strength !== null
    ? {
        aSampleId: pair.aSampleId,
        bSampleId: pair.bSampleId,
        overall: judgment.overall,
        strength: judgment.strength,
      }
    : null;

/** One pair judgment, with the telemetry the team lead's brief called out as
 * entirely missing: before this, a pair call left no trace in the app log at
 * all, so a run full of failed pairs was indistinguishable from a healthy one
 * from the outside, and pair completion was uncountable. One compact line per
 * pair — both samples' model aliases (never a prompt, a URL, or image bytes:
 * `BRIEF.md` rule 3's spirit, applied to logs, not just spans), the outcome
 * (winner + strength) or the failure code, and how long the call took. Pure
 * with respect to Postgres — takes an already-resolved URL map and alias map,
 * so it is testable without a `getDb()` call. */
export const judgeOnePairWithTelemetry = async (
  judge: ComparativeJudge,
  pair: JudgePair,
  prompt: string,
  urlBySample: ReadonlyMap<string, string>,
  aliasBySample: ReadonlyMap<string, string>
): Promise<PairOutcome | null> => {
  const imageUrlA = urlBySample.get(pair.aSampleId);
  const imageUrlB = urlBySample.get(pair.bSampleId);
  if (imageUrlA === undefined || imageUrlB === undefined) {
    return null;
  }

  const aliasA = aliasBySample.get(pair.aSampleId) ?? pair.aSampleId;
  const aliasB = aliasBySample.get(pair.bSampleId) ?? pair.bSampleId;
  const startedAt = Date.now();
  const judgment = await judge.judgePair({ imageUrlA, imageUrlB, prompt });
  const durationMs = Date.now() - startedAt;

  // A failed pair is skipped, never fatal — the sample simply completes
  // fewer comparisons, and Bradley-Terry handles an uneven graph.
  const outcome = pairOutcomeFrom(pair, judgment);
  const outcomeLabel = outcome
    ? `${outcome.overall}:${outcome.strength}`
    : `failed:${judgment.errorCode ?? "UNKNOWN"}`;
  console.log(
    `[bench db-store-judging] pair ${aliasA}(A)/${aliasB}(B) -> ${outcomeLabel} (${durationMs}ms)`
  );

  return outcome;
};

/** One completed comparison, from the sample's own point of view — the value
 * stored under that opponent's key in `bench_judgments.levels`. */
const outcomeLabelFor = (outcome: PairOutcome, isA: boolean): string => {
  if (outcome.overall === "tie") {
    return "tie";
  }
  const won = (outcome.overall === "a") === isA;
  return `${won ? "win" : "loss"}:${outcome.strength}`;
};

const buildOpponentMaps = (
  outcomes: readonly PairOutcome[]
): Map<string, Map<string, string>> => {
  const byS = new Map<string, Map<string, string>>();
  const add = (sampleId: string, opponentId: string, label: string): void => {
    const existing = byS.get(sampleId) ?? new Map<string, string>();
    existing.set(opponentId, label);
    byS.set(sampleId, existing);
  };
  for (const outcome of outcomes) {
    add(outcome.aSampleId, outcome.bSampleId, outcomeLabelFor(outcome, true));
    add(outcome.bSampleId, outcome.aSampleId, outcomeLabelFor(outcome, false));
  }
  return byS;
};

const standingsCritique = (entry: {
  comparisons: number;
  losses: number;
  ties: number;
  wins: number;
}): string =>
  `${entry.wins} won, ${entry.losses} lost, ${entry.ties} tied across ${entry.comparisons} head-to-head comparisons.`;

/**
 * Runs the whole comparative pass for one run: plan → judge every pair →
 * Bradley-Terry → one `bench_judgments` row per sample. Every write goes
 * through the same `(sample, judge, rubric, version)` upsert the absolute
 * path uses, so re-judging replaces rather than duplicates.
 */
const runComparativePass = async (
  runId: string,
  judge: ComparativeJudge,
  prompt: string,
  seed: number,
  samples: readonly RankableSample[]
): Promise<void> => {
  const db = await getDb();
  const urlBySample = await resolveJudgeableUrls(judge, samples);
  const judgeable = samples.filter((sample) => urlBySample.has(sample.id));
  if (judgeable.length < 2) {
    await setJudgingStatus(db, runId, "running", "done");
    return;
  }

  const pairs = planPairings(
    judgeable.map((sample) => sample.id),
    { seed }
  );
  const aliasBySample = new Map(
    samples.map((sample) => [sample.id, sample.alias])
  );

  const results = await mapWithConcurrency(
    pairs,
    JUDGE_PAIR_CONCURRENCY,
    async (pair) =>
      await judgeOnePairWithTelemetry(
        judge,
        pair,
        prompt,
        urlBySample,
        aliasBySample
      )
  );

  const outcomes = results.filter((outcome) => outcome !== null);
  console.log(
    `[bench db-store-judging] comparative pass run=${runId}: pairs planned=${pairs.length} completed=${outcomes.length} failed=${pairs.length - outcomes.length}`
  );
  const ranked = rankSamples(
    judgeable.map((sample) => sample.id),
    outcomes
  );
  const opponentsBySample = buildOpponentMaps(outcomes);
  const rankedById = new Map(
    ranked.samples.map((entry) => [entry.sampleId, entry])
  );

  // Every completed sample gets a row, including one whose image never made
  // it to the CDN — otherwise `markJudgingDoneIfSettled` would never see the
  // run as fully judged and the "Judging…" banner would stay up forever
  // (the hang class this app has already been bitten by once).
  for (const sample of samples) {
    const entry = rankedById.get(sample.id) ?? {
      comparisons: 0,
      losses: 0,
      rank: null,
      rankScore: null,
      ties: 0,
      wins: 0,
    };
    const levels = toRankLevelsJson({
      comparisons: entry.comparisons,
      losses: entry.losses,
      opponents: opponentsBySample.get(sample.id) ?? new Map(),
      rank: entry.rank,
      rankedCount: ranked.rankedCount,
      ties: entry.ties,
      wins: entry.wins,
    });
    const status = entry.rankScore === null ? "inconclusive" : "scored";
    const critique = entry.rankScore === null ? null : standingsCritique(entry);

    await db
      .insert(benchJudgments)
      .values({
        // fal's `any-llm/vision` reports no billing field, so this stays
        // `null` — unknown cost, not free cost (`BRIEF.md` rule 9).
        costMicros: null,
        critique,
        id: randomUUID(),
        judgeModel: judge.modelLabel,
        levels,
        overall: entry.rankScore,
        rubricId: RANK_RUBRIC_ID,
        rubricVersion: RANK_RUBRIC_VERSION,
        sampleId: sample.id,
        status,
      })
      .onConflictDoUpdate({
        set: {
          costMicros: null,
          critique,
          levels,
          overall: entry.rankScore,
          status,
          updatedAt: new Date(),
        },
        target: [
          benchJudgments.sampleId,
          benchJudgments.judgeModel,
          benchJudgments.rubricId,
          benchJudgments.rubricVersion,
        ],
      });
  }

  await markJudgingDoneIfSettled(runId);
};

/**
 * The comparative entry point. Returns `true` when it has taken ownership of
 * judging this run (so `startJudging` must not also run the absolute pass),
 * `false` when a comparative pass does not apply: an engine that cannot judge
 * comparatively (the mock engine), or fewer than two completed samples with
 * an image on disk — with nothing to compare against, `judge.ts`'s absolute
 * scoring is still the correct answer.
 *
 * The sweep itself is detached, exactly like the absolute path's per-sample
 * timers: `judgingStatus` flips to `running` synchronously so the UI shows
 * "Judging…" immediately, and the 72 provider calls proceed in the
 * background.
 */
export const startComparativeJudging = async (
  runId: string,
  engine: RunEngine,
  force = false
): Promise<boolean> => {
  const judge = engine.comparativeJudge;
  if (judge === null) {
    return false;
  }

  const db = await getDb();
  const [run] = await db
    .select({
      prompt: benchRuns.prompt,
      seed: benchRuns.seed,
      spec: benchRuns.spec,
    })
    .from(benchRuns)
    .where(eq(benchRuns.id, runId))
    .limit(1);
  if (!run) {
    return false;
  }

  const rows = await db
    .select({
      id: benchSamples.id,
      imagePath: benchSamples.imagePath,
      modelAlias: benchSamples.modelAlias,
    })
    .from(benchSamples)
    .where(
      and(eq(benchSamples.runId, runId), eq(benchSamples.status, "completed"))
    )
    .orderBy(asc(benchSamples.executionOrdinal));
  const samples: RankableSample[] = rows.flatMap((row) =>
    row.imagePath === null
      ? []
      : [{ alias: row.modelAlias, id: row.id, imagePath: row.imagePath }]
  );
  if (samples.length < 2) {
    return false;
  }

  const alreadyRanked = await db
    .select({ sampleId: benchJudgments.sampleId })
    .from(benchJudgments)
    .where(
      and(
        inArray(
          benchJudgments.sampleId,
          samples.map((sample) => sample.id)
        ),
        eq(benchJudgments.judgeModel, judge.modelLabel),
        eq(benchJudgments.rubricId, RANK_RUBRIC_ID),
        eq(benchJudgments.rubricVersion, RANK_RUBRIC_VERSION)
      )
    );
  const spec = RunSpecJsonSchema.parse(run.spec);
  // `force` is the explicit POST /judge path: skip the idempotence guard so a
  // re-judge actually re-runs pairs (the upsert replaces rows). Without it a
  // fully-ranked run silently no-ops — two production re-judges did exactly
  // that while the endpoint reported started:true.
  if (!force && alreadyRanked.length === samples.length) {
    if (spec.judgingStatus === "not-started") {
      await setJudgingStatus(db, runId, "not-started", "done");
    }
    return true;
  }

  await setJudgingStatus(db, runId, spec.judgingStatus, "running");

  // A run's own `seed` is the natural determinism source; a seedless run
  // falls back to a hash of its id, so the plan is still reproducible for
  // that run without ever reaching for `Math.random`.
  const seed = run.seed ?? Math.floor(hashUnit(`${runId}:pairing`) * 2 ** 31);

  runDetached("runComparativePass", async () => {
    await runComparativePass(runId, judge, run.prompt, seed, samples);
  });
  return true;
};

/** Judges every completed sample of a run that does not already carry a
 * judgment for `(sample, judgeModel, rubricId, rubricVersion)` — the insert
 * above upserts on that exact composite unique constraint
 * (`bench_judgments_sample_judge_rubric_version_unique`), so re-judging
 * replaces the row instead of duplicating it. Mirrors `mock-store.ts`'s
 * `startJudging` staggering (mock only — the live engine's "delay" is the
 * real judge-model call itself, so it starts immediately). */
export const startJudging = async (
  runId: string,
  judgeModel: string,
  engine: RunEngine,
  force = false
): Promise<void> => {
  // Comparative first: absolute scoring saturates (5 distinct verdicts across
  // 20 real judgments, 14 models byte-identical — see
  // `@motif/bench-core/rank-judge`'s header), so whenever there are at least
  // two completed samples to compare and an engine that can compare them,
  // ranking is the answer. `startComparativeJudging` declines — and the
  // absolute pass below runs unchanged — for the mock engine and for a run
  // with fewer than two comparable samples.
  if (await startComparativeJudging(runId, engine, force)) {
    return;
  }

  const db = await getDb();
  const [run] = await db
    .select({ prompt: benchRuns.prompt, spec: benchRuns.spec })
    .from(benchRuns)
    .where(eq(benchRuns.id, runId))
    .limit(1);
  if (!run) {
    return;
  }

  const completedSamples = await db
    .select({
      id: benchSamples.id,
      imagePath: benchSamples.imagePath,
      modelAlias: benchSamples.modelAlias,
    })
    .from(benchSamples)
    .where(
      and(eq(benchSamples.runId, runId), eq(benchSamples.status, "completed"))
    );

  const alreadyJudged =
    completedSamples.length === 0
      ? []
      : await db
          .select({ sampleId: benchJudgments.sampleId })
          .from(benchJudgments)
          .where(
            and(
              inArray(
                benchJudgments.sampleId,
                completedSamples.map((s) => s.id)
              ),
              eq(benchJudgments.judgeModel, judgeModel),
              eq(benchJudgments.rubricId, ROOM_RUBRIC_ID),
              eq(benchJudgments.rubricVersion, ROOM_RUBRIC_VERSION)
            )
          );
  const judgedIds = new Set(alreadyJudged.map((j) => j.sampleId));
  const toJudge = completedSamples.filter((s) => !judgedIds.has(s.id));

  const spec = RunSpecJsonSchema.parse(run.spec);

  if (toJudge.length === 0) {
    if (spec.judgingStatus === "not-started") {
      await setJudgingStatus(db, runId, "not-started", "done");
    }
    return;
  }

  await setJudgingStatus(db, runId, spec.judgingStatus, "running");

  let maxDelayMs = 0;
  for (const sample of toJudge) {
    const delayMs = engine.isMock
      ? 250 + hashUnit(`${sample.id}:judge-delay`) * 1800
      : 0;
    maxDelayMs = Math.max(maxDelayMs, delayMs);
    setTimeout(() => {
      runDetached("judgeOneSample", async () => {
        await judgeOneSample(
          runId,
          sample.id,
          sample.modelAlias,
          sample.imagePath,
          run.prompt,
          judgeModel,
          engine
        );
      });
    }, delayMs);
  }

  setTimeout(() => {
    runDetached("markJudgingDoneIfSettled", async () => {
      await markJudgingDoneIfSettled(runId);
    });
  }, maxDelayMs + 50);
};
