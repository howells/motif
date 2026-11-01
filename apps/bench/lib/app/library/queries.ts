/**
 * One person's Library: their stacks, latest first, and the versions in each.
 * Every query is scoped to the owner in SQL.
 */
import type { AppSql } from "@motif/bench-db/app-sql";

import { date, integer, stringArray, text, textOrNull } from "../rows";
import { getOwnedGenerations } from "../tasks/store";
import type { Generation } from "../tasks/store";

export interface StackSummary {
  /** The Board and node that made it, for an image made on a Board. */
  readonly board: { readonly id: string; readonly name: string } | null;
  readonly comparisonId: string | null;
  readonly completedAt: Date;
  readonly costMicros: number;
  readonly latestId: string;
  readonly model: string;
  readonly outputAssetIds: readonly string[];
  /** Whether it is its node's Pick right now. */
  readonly picked: boolean;
  readonly prompt: string | null;
  readonly stackId: string;
  readonly task: string;
  readonly versions: number;
}

const STACKS = `
WITH latest AS (
  SELECT DISTINCT ON (g.stack_id)
         g.stack_id, g.id, g.task, g.model, g.output_asset_ids, g.completed_at, g.comparison_id
    FROM app_generations g
   WHERE g.owner_id = $1 AND g.status = 'completed'
   ORDER BY g.stack_id, g.completed_at DESC
), stacks AS (
  SELECT g.stack_id,
         count(*) FILTER (WHERE g.status = 'completed')::int AS versions,
         COALESCE(sum(COALESCE(g.cost_micros, h.bound_micros))
                  FILTER (WHERE g.cost_status IN ('settled', 'retained')), 0)::bigint AS cost_micros,
         (array_agg(g.prompt ORDER BY g.created_at ASC) FILTER (WHERE g.prompt IS NOT NULL))[1] AS prompt
    FROM app_generations g JOIN app_holds h ON h.id = g.hold_id
   WHERE g.owner_id = $1
   GROUP BY g.stack_id
)
SELECT latest.*, stacks.versions, stacks.cost_micros, stacks.prompt,
       b.id AS board_id, b.name AS board_name,
       (n.pick_asset_id IS NOT NULL AND n.pick_asset_id = latest.output_asset_ids->>0) AS picked
  FROM latest JOIN stacks USING (stack_id)
  LEFT JOIN app_node_results r ON r.generation_id = latest.id AND r.owner_id = $1
  LEFT JOIN app_boards b ON b.id = r.board_id AND b.owner_id = $1
  LEFT JOIN app_nodes n ON n.id = r.node_id AND n.owner_id = $1
 WHERE ($2::text IS NULL OR stacks.prompt ILIKE '%' || $2 || '%')
   AND (NOT $3::boolean OR latest.comparison_id IS NOT NULL)
   AND ($5::text IS NULL OR b.id = $5)
   AND ($6::text IS NULL OR latest.task = $6)
 ORDER BY latest.completed_at DESC
 LIMIT $4`;

export const listStacks = async (
  sql: AppSql,
  ownerId: string,
  options: {
    readonly search?: string;
    readonly comparisonsOnly?: boolean;
    readonly limit?: number;
    /** Only images made on this Board. */
    readonly boardId?: string;
    /** Only images made by this Task. */
    readonly task?: string;
  } = {}
): Promise<StackSummary[]> => {
  const search = options.search?.trim();
  const rows = await sql(STACKS, [
    ownerId,
    search === undefined || search === ""
      ? null
      : search.replaceAll(/[%_\\]/gu, (match) => `\\${match}`),
    options.comparisonsOnly === true,
    Math.min(options.limit ?? 120, 240),
    options.boardId ?? null,
    options.task ?? null,
  ]);
  return rows.map((row) => {
    const boardId = textOrNull(row, "board_id");
    return {
      board:
        boardId === null
          ? null
          : { id: boardId, name: text(row, "board_name") },
      comparisonId: textOrNull(row, "comparison_id"),
      completedAt: date(row, "completed_at"),
      costMicros: integer(row, "cost_micros"),
      latestId: text(row, "id"),
      model: text(row, "model"),
      outputAssetIds: stringArray(row, "output_asset_ids"),
      picked: row.picked === true,
      prompt: textOrNull(row, "prompt"),
      stackId: text(row, "stack_id"),
      task: text(row, "task"),
      versions: integer(row, "versions"),
    };
  });
};

const IMAGES = `
SELECT COALESCE(sum(jsonb_array_length(output_asset_ids)), 0)::int AS images
  FROM app_generations WHERE owner_id = $1 AND status = 'completed'`;

/** How many images the owner has made, all told. */
export const countImages = async (
  sql: AppSql,
  ownerId: string
): Promise<number> => {
  const [row] = await sql(IMAGES, [ownerId]);
  return row === undefined ? 0 : integer(row, "images");
};

const STACK_IDS = `
SELECT id FROM app_generations WHERE owner_id = $1 AND stack_id = $2 ORDER BY created_at DESC`;

/** Every run in one of the owner's stacks, latest first. Empty for another
 * person's stack. */
export const listStack = async (
  sql: AppSql,
  ownerId: string,
  stackId: string
): Promise<Generation[]> => {
  const rows = await sql(STACK_IDS, [ownerId, stackId]);
  const generations = await getOwnedGenerations(
    sql,
    ownerId,
    rows.map((row) => text(row, "id"))
  );
  return generations.toReversed();
};

const RECENT = `
SELECT id FROM app_generations
 WHERE owner_id = $1 AND ($2::text IS NULL OR task = $2) AND comparison_id IS NULL
 ORDER BY created_at DESC LIMIT $3`;

/** The owner's latest runs, of one Task or all, in any state. */
export const listRecent = async (
  sql: AppSql,
  ownerId: string,
  task: string | null,
  limit = 6
): Promise<Generation[]> => {
  const rows = await sql(RECENT, [ownerId, task, limit]);
  const generations = await getOwnedGenerations(
    sql,
    ownerId,
    rows.map((row) => text(row, "id"))
  );
  return generations.toReversed();
};

const COMPARISON = `
SELECT id, prompt, models, created_at FROM app_comparisons WHERE id = $1 AND owner_id = $2`;

const COMPARISON_RUNS = `
SELECT id FROM app_generations WHERE comparison_id = $1 AND owner_id = $2 ORDER BY created_at ASC`;

export interface ComparisonRecord {
  readonly createdAt: Date;
  readonly generations: readonly Generation[];
  readonly id: string;
  readonly models: readonly string[];
  readonly prompt: string;
}

export const getOwnedComparison = async (
  sql: AppSql,
  ownerId: string,
  id: string
): Promise<ComparisonRecord | null> => {
  const [row] = await sql(COMPARISON, [id, ownerId]);
  if (row === undefined) {
    return null;
  }
  const runs = await sql(COMPARISON_RUNS, [id, ownerId]);
  const generations = await getOwnedGenerations(
    sql,
    ownerId,
    runs.map((run) => text(run, "id"))
  );
  return {
    createdAt: date(row, "created_at"),
    generations,
    id: text(row, "id"),
    models: stringArray(row, "models"),
    prompt: text(row, "prompt"),
  };
};
