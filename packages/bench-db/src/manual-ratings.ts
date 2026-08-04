import { eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

import { benchManualRatings, benchSamples } from "./schema";

/**
 * Domain-side read/write helpers for `bench_manual_ratings` — a human 1–5
 * star override alongside the vision judge's score. No UI here; that is
 * Phase 4's job. These functions take an already-constructed `db` instance
 * as a parameter (dependency injection, the same posture as
 * `bench-core`/`bench-mastra`'s injected executors) rather than importing
 * `./client`'s `db()` themselves — `client.ts` eagerly parses
 * `@motif/bench-env/server`, and this module must stay usable (and testable
 * without a live database) independent of that.
 *
 * Typed against the default, unparameterized `NeonHttpDatabase` rather than
 * the app's exact schema type: `insert`/`select`/`update` take the table
 * object directly and don't depend on the store's relations type parameter
 * (that parameter only powers Drizzle's relational `db.query.*` API, unused
 * here) — so `db()`'s actual, schema-carrying return type (`./client.ts`)
 * still satisfies this looser one at every call site.
 */
export type BenchDb = NeonHttpDatabase;

export interface ManualRatingInput {
  readonly note?: string | null;
  /** 1–5; enforced at the database by `bench_manual_ratings_stars_check`. */
  readonly sampleId: string;
  readonly stars: number;
}

export interface ManualRating {
  readonly createdAt: Date;
  readonly note: string | null;
  readonly sampleId: string;
  readonly stars: number;
  readonly updatedAt: Date;
}

/**
 * Insert-or-update a sample's manual rating — `bench_manual_ratings` is
 * primary-keyed on `sampleId`, so a second call for the same sample replaces
 * the star rating and note rather than erroring.
 */
export const upsertManualRating = async (
  db: BenchDb,
  input: ManualRatingInput
): Promise<ManualRating> => {
  const [row] = await db
    .insert(benchManualRatings)
    .values({
      note: input.note ?? null,
      sampleId: input.sampleId,
      stars: input.stars,
    })
    .onConflictDoUpdate({
      set: {
        note: input.note ?? null,
        stars: input.stars,
        updatedAt: new Date(),
      },
      target: benchManualRatings.sampleId,
    })
    .returning();

  if (!row) {
    throw new Error(
      `upsertManualRating: insert/update for sample "${input.sampleId}" returned no row`
    );
  }
  return row;
};

/** Reads one sample's manual rating, or `null` if it has none yet. */
export const getManualRating = async (
  db: BenchDb,
  sampleId: string
): Promise<ManualRating | null> => {
  const [row] = await db
    .select()
    .from(benchManualRatings)
    .where(eq(benchManualRatings.sampleId, sampleId))
    .limit(1);
  return row ?? null;
};

/** Every manual rating recorded for a run's samples — `bench_manual_ratings`
 * has no `runId` column of its own, so this joins through `bench_samples`. */
export const listManualRatingsForRun = async (
  db: BenchDb,
  runId: string
): Promise<ManualRating[]> =>
  await db
    .select({
      createdAt: benchManualRatings.createdAt,
      note: benchManualRatings.note,
      sampleId: benchManualRatings.sampleId,
      stars: benchManualRatings.stars,
      updatedAt: benchManualRatings.updatedAt,
    })
    .from(benchManualRatings)
    .innerJoin(benchSamples, eq(benchSamples.id, benchManualRatings.sampleId))
    .where(eq(benchSamples.runId, runId));
