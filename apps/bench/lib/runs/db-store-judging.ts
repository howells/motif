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
import { benchJudgments, benchRuns, benchSamples } from "@motif/bench-db";
import type { BenchDb } from "@motif/bench-db";
import { and, eq, inArray, sql } from "drizzle-orm";

import { RunSpecJsonSchema, toLevelsJson } from "./db-json";
import type { RunEngine } from "./engine";
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
  engine: RunEngine
): Promise<void> => {
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
