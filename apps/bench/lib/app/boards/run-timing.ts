/**
 * How long a Model usually takes for this owner, from their own finished
 * Generations. The last twenty, read in one bounded statement scoped to the
 * owner; the median, so one slow day doesn't move it.
 */
import type { AppSql } from "@motif/bench-db/app-sql";

import { integer } from "../rows";

/** Generations looked at, newest first. */
export const HISTORY = 20;

/** Fewer than this and "usually" would be a guess. */
export const MIN_SAMPLES = 3;

const RECENT = `
SELECT provider_ms FROM app_generations
 WHERE owner_id = $1 AND model = $2 AND status = 'completed'
   AND provider_ms IS NOT NULL AND provider_ms > 0
 ORDER BY created_at DESC LIMIT $3`;

/** The middle value; the mean of the two in the middle for an even count. */
export const medianOf = (values: readonly number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const high = sorted[middle];
  const low = sorted[middle - 1];
  if (high === undefined) {
    return null;
  }
  return sorted.length % 2 === 1 || low === undefined
    ? high
    : Math.round((low + high) / 2);
};

/** The median time fal took for this owner's recent runs of the Model, or
 * `null` when there isn't enough history to say. */
export const typicalDurationMs = async (
  sql: AppSql,
  ownerId: string,
  model: string
): Promise<number | null> => {
  const rows = await sql(RECENT, [ownerId, model, HISTORY]);
  if (rows.length < MIN_SAMPLES) {
    return null;
  }
  return medianOf(rows.map((row) => integer(row, "provider_ms")));
};
