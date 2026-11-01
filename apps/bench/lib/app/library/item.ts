/**
 * One image in the Library, opened: what made it, on which Board, and the
 * images it was made from. Every read is scoped to the owner.
 */
import type { AppSql } from "@motif/bench-db/app-sql";

import { modelName } from "../boards/names";
import { getOwnedAssets } from "../media/assets";
import { text } from "../rows";
import { getOwnedGeneration, getOwnedGenerations } from "../tasks/store";
import type { Generation } from "../tasks/store";
import { mediaUrl } from "../views";

/** How far back "Made from" looks. */
const MAX_ANCESTORS = 4;

export interface MadeFromStep {
  readonly assetId: string;
  readonly generationId: string;
  readonly task: string;
  readonly url: string;
}

export interface LibraryItem {
  readonly assetId: string;
  readonly board: { readonly id: string; readonly name: string } | null;
  readonly completedAt: string | null;
  readonly costMicros: number | null;
  readonly generationId: string;
  readonly height: number | null;
  /** Oldest first, ending with this image. Just this one when nothing made
   * it from another of the owner's images. */
  readonly madeFrom: readonly MadeFromStep[];
  readonly modelName: string;
  readonly mode: string | null;
  readonly nodeId: string | null;
  readonly prompt: string | null;
  readonly task: string;
  readonly url: string;
  readonly width: number | null;
}

const stepOf = (generation: Generation): MadeFromStep | null => {
  const [assetId] = generation.outputAssetIds;
  return assetId === undefined
    ? null
    : {
        assetId,
        generationId: generation.id,
        task: generation.task,
        url: mediaUrl(assetId),
      };
};

/** The Generations this one came from, following each Source back to the
 * Generation that made it, oldest first. */
const ANCESTORS = `
WITH RECURSIVE chain (id, source, depth) AS (
  SELECT g.id, g.source_asset_id, 0
    FROM app_generations g
   WHERE g.id = $1 AND g.owner_id = $2
  UNION ALL
  SELECT p.id, p.source_asset_id, c.depth + 1
    FROM chain c
    CROSS JOIN LATERAL (
      SELECT g.id, g.source_asset_id
        FROM app_generations g
       WHERE g.owner_id = $2 AND g.status = 'completed'
         AND g.output_asset_ids @> jsonb_build_array(c.source)
       ORDER BY g.completed_at DESC
       LIMIT 1
    ) p
   WHERE c.source IS NOT NULL AND c.depth < $3
)
SELECT id FROM chain WHERE depth > 0 ORDER BY depth DESC`;

const ancestorsOf = async (
  sql: AppSql,
  ownerId: string,
  generationId: string
): Promise<MadeFromStep[]> => {
  const rows = await sql(ANCESTORS, [generationId, ownerId, MAX_ANCESTORS]);
  const ids = rows.map((row) => text(row, "id"));
  const generations = await getOwnedGenerations(sql, ownerId, ids);
  const found = new Map(
    generations.map((generation) => [generation.id, generation])
  );
  return ids.flatMap((id) => {
    const generation = found.get(id);
    const step = generation === undefined ? null : stepOf(generation);
    return step === null ? [] : [step];
  });
};

const PLACE = `
SELECT b.id AS board_id, b.name AS board_name, r.node_id
  FROM app_node_results r JOIN app_boards b ON b.id = r.board_id AND b.owner_id = $2
 WHERE r.generation_id = $1 AND r.owner_id = $2`;

interface Place {
  readonly board: { readonly id: string; readonly name: string } | null;
  readonly nodeId: string | null;
}

/** The Board and node that made a Generation, if a Board made it. */
const placeOf = async (
  sql: AppSql,
  ownerId: string,
  generationId: string
): Promise<Place> => {
  const [row] = await sql(PLACE, [generationId, ownerId]);
  if (row === undefined) {
    return { board: null, nodeId: null };
  }
  return {
    board: { id: text(row, "board_id"), name: text(row, "board_name") },
    nodeId: text(row, "node_id"),
  };
};

/** One of the owner's images, or `null` for another person's, a missing
 * one, or one that made nothing. */
export const getLibraryItem = async (
  sql: AppSql,
  ownerId: string,
  generationId: string
): Promise<LibraryItem | null> => {
  const generation = await getOwnedGeneration(sql, ownerId, generationId);
  const self = generation === null ? null : stepOf(generation);
  if (generation === null || self === null) {
    return null;
  }
  const [ancestors, assets, place] = await Promise.all([
    ancestorsOf(sql, ownerId, generationId),
    getOwnedAssets(sql, ownerId, [self.assetId]),
    placeOf(sql, ownerId, generationId),
  ]);
  const asset = assets?.[0];
  return {
    assetId: self.assetId,
    board: place.board,
    completedAt: generation.completedAt?.toISOString() ?? null,
    costMicros: generation.costMicros,
    generationId,
    height: asset?.height ?? null,
    madeFrom: [...ancestors, self],
    modelName: modelName(generation.model),
    mode: generation.mode,
    nodeId: place.nodeId,
    prompt: generation.prompt,
    task: generation.task,
    url: self.url,
    width: asset?.width ?? null,
  };
};
