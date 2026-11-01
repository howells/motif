/**
 * Boards, their nodes and wires, and the runs made on them: one SQL
 * statement per change, every one scoped to its owner in SQL. Another
 * person's Board, node or wire reads as missing and can't be changed.
 *
 * Nothing is deleted. A removed node or wire keeps its row with `removed_at`
 * set, so the Library can still say which Board and node made an image.
 */
import type { AppRow, AppSql } from "@motif/bench-db/app-sql";
import { z } from "zod";

import { newId } from "../ids";
import { date, integer, text, textOrNull } from "../rows";
import { SettingsInputSchema, isNodeKind, parseSettings } from "./model";
import type { GraphWire, KindSettings, NodeKind } from "./model";

export interface Board {
  readonly id: string;
  readonly kind: "board" | "inbox";
  readonly name: string;
  readonly updatedAt: Date;
}

export interface BoardSummary extends Board {
  readonly images: number;
}

interface BoardNodeBase {
  readonly boardId: string;
  readonly id: string;
  readonly pickAssetId: string | null;
  readonly stale: boolean;
  readonly x: number;
  readonly y: number;
}

/** A node as stored: its kind and settings typed together. */
export type BoardNode = BoardNodeBase & KindSettings;

export type BoardWire = GraphWire;

export const INBOX_NAME = "Inbox";

const boardOf = (row: AppRow): Board => {
  const kind = text(row, "kind");
  return {
    id: text(row, "id"),
    kind: kind === "inbox" ? "inbox" : "board",
    name: text(row, "name"),
    updatedAt: date(row, "updated_at"),
  };
};

/** A double-precision column; the driver may hand it back as text. */
const Coordinate = z.union([z.number(), z.string()]).pipe(z.coerce.number());

const numberOf = (row: AppRow, column: string): number => {
  const read = Coordinate.safeParse(row[column]);
  if (!read.success) {
    throw new TypeError(`Column ${column} isn't a number.`);
  }
  return read.data;
};

const kindOf = (row: AppRow): NodeKind => {
  const kind = text(row, "kind");
  if (!isNodeKind(kind)) {
    throw new TypeError(`Unknown node kind ${kind}.`);
  }
  return kind;
};

/** A stored node, its settings read with its kind's schema. Settings that
 * no longer parse are an error, not something to guess around. */
const nodeOf = (row: AppRow): BoardNode => {
  const id = text(row, "id");
  const stored = SettingsInputSchema.safeParse(row.settings ?? {});
  if (!stored.success) {
    throw new TypeError(`Node ${id} has settings that aren't plain values.`);
  }
  const read = parseSettings(kindOf(row), stored.data);
  if (!read.ok) {
    throw new TypeError(
      `Node ${id} has settings that don't parse: ${read.message}`
    );
  }
  return {
    ...read.node,
    boardId: text(row, "board_id"),
    id,
    pickAssetId: textOrNull(row, "pick_asset_id"),
    stale: row.stale === true,
    x: numberOf(row, "position_x"),
    y: numberOf(row, "position_y"),
  };
};

const wireOf = (row: AppRow): BoardWire => ({
  from: text(row, "from_node_id"),
  id: text(row, "id"),
  to: text(row, "to_node_id"),
});

// ── Boards ────────────────────────────────────────────────────────────

const ENSURE_INBOX = `
INSERT INTO app_boards (id, owner_id, kind, name) VALUES ($1, $2, 'inbox', $3)
ON CONFLICT (owner_id) WHERE kind = 'inbox' DO NOTHING`;

const INBOX = `
SELECT id, kind, name, updated_at FROM app_boards
 WHERE owner_id = $1 AND kind = 'inbox'`;

/** The member's Inbox, made the first time it is asked for. */
export const ensureInbox = async (
  sql: AppSql,
  ownerId: string
): Promise<Board> => {
  await sql(ENSURE_INBOX, [newId("brd"), ownerId, INBOX_NAME]);
  const [row] = await sql(INBOX, [ownerId]);
  if (row === undefined) {
    throw new Error("The Inbox wasn't created.");
  }
  return boardOf(row);
};

const LIST_BOARDS = `
SELECT b.id, b.kind, b.name, b.updated_at,
       (SELECT count(*) FROM app_node_results r
          JOIN app_generations g ON g.id = r.generation_id
         WHERE r.board_id = b.id AND r.owner_id = $1 AND g.status = 'completed')::int AS images
  FROM app_boards b
 WHERE b.owner_id = $1
 ORDER BY (b.kind = 'inbox') DESC, b.updated_at DESC`;

export const listBoards = async (
  sql: AppSql,
  ownerId: string
): Promise<BoardSummary[]> => {
  const rows = await sql(LIST_BOARDS, [ownerId]);
  return rows.map((row) => ({
    ...boardOf(row),
    images: integer(row, "images"),
  }));
};

const GET_BOARD = `
SELECT id, kind, name, updated_at FROM app_boards WHERE id = $1 AND owner_id = $2`;

export const getOwnedBoard = async (
  sql: AppSql,
  ownerId: string,
  boardId: string
): Promise<Board | null> => {
  const [row] = await sql(GET_BOARD, [boardId, ownerId]);
  return row === undefined ? null : boardOf(row);
};

const CREATE_BOARD = `
INSERT INTO app_boards (id, owner_id, kind, name) VALUES ($1, $2, 'board', $3)
RETURNING id, kind, name, updated_at`;

export const createBoard = async (
  sql: AppSql,
  ownerId: string,
  name: string
): Promise<Board> => {
  const [row] = await sql(CREATE_BOARD, [newId("brd"), ownerId, name]);
  if (row === undefined) {
    throw new Error("The Board wasn't created.");
  }
  return boardOf(row);
};

const RENAME_BOARD = `
UPDATE app_boards SET name = $3, updated_at = now()
 WHERE id = $1 AND owner_id = $2 AND kind = 'board'
RETURNING id, kind, name, updated_at`;

/** Rename a Board. The Inbox keeps its name. */
export const renameBoard = async (
  sql: AppSql,
  ownerId: string,
  boardId: string,
  name: string
): Promise<Board | null> => {
  const [row] = await sql(RENAME_BOARD, [boardId, ownerId, name]);
  return row === undefined ? null : boardOf(row);
};

// ── Nodes and wires ───────────────────────────────────────────────────

const NODE_COLUMNS = `n.id, n.board_id, n.kind, n.position_x, n.position_y, n.settings,
n.pick_asset_id, n.stale`;

const LIVE_NODES = `
SELECT ${NODE_COLUMNS} FROM app_nodes n
 WHERE n.board_id = $1 AND n.owner_id = $2 AND n.removed_at IS NULL
 ORDER BY n.created_at ASC`;

const LIVE_WIRES = `
SELECT w.id, w.from_node_id, w.to_node_id FROM app_wires w
 WHERE w.board_id = $1 AND w.owner_id = $2 AND w.removed_at IS NULL`;

export interface Graph {
  readonly nodes: readonly BoardNode[];
  readonly wires: readonly BoardWire[];
}

export const getGraph = async (
  sql: AppSql,
  ownerId: string,
  boardId: string
): Promise<Graph> => {
  const [nodes, wires] = await Promise.all([
    sql(LIVE_NODES, [boardId, ownerId]),
    sql(LIVE_WIRES, [boardId, ownerId]),
  ]);
  return {
    nodes: nodes.map((row) => nodeOf(row)),
    wires: wires.map((row) => wireOf(row)),
  };
};

const GET_NODE = `
SELECT ${NODE_COLUMNS} FROM app_nodes n
 WHERE n.id = $1 AND n.owner_id = $2 AND n.removed_at IS NULL`;

export const getOwnedNode = async (
  sql: AppSql,
  ownerId: string,
  nodeId: string
): Promise<BoardNode | null> => {
  const [row] = await sql(GET_NODE, [nodeId, ownerId]);
  return row === undefined ? null : nodeOf(row);
};

const ADD_NODE = `
WITH b AS (
  UPDATE app_boards SET updated_at = now() WHERE id = $2 AND owner_id = $3 RETURNING id
)
INSERT INTO app_nodes (id, board_id, owner_id, kind, position_x, position_y, settings)
SELECT $1, b.id, $3, $4, $5, $6, $7::jsonb FROM b
RETURNING id, board_id, kind, position_x, position_y, settings, pick_asset_id, stale`;

export type NewNode = KindSettings & {
  readonly x: number;
  readonly y: number;
  /** For a Source made from an image: it is its own Pick. */
  readonly pickAssetId?: string | null;
};

/** Add a node to the member's own Board, or `null` if it isn't theirs. */
export const addNode = async (
  sql: AppSql,
  ownerId: string,
  boardId: string,
  node: NewNode
): Promise<BoardNode | null> => {
  const id = newId("nod");
  const [row] = await sql(ADD_NODE, [
    id,
    boardId,
    ownerId,
    node.kind,
    node.x,
    node.y,
    JSON.stringify(node.settings),
  ]);
  if (row === undefined) {
    return null;
  }
  if (node.pickAssetId !== undefined && node.pickAssetId !== null) {
    await setPick(sql, ownerId, id, node.pickAssetId, []);
    return { ...nodeOf(row), pickAssetId: node.pickAssetId };
  }
  return nodeOf(row);
};

const MOVE_NODES = `
UPDATE app_nodes n
   SET position_x = m.x, position_y = m.y, updated_at = now()
  FROM jsonb_to_recordset($2::jsonb) AS m(id text, x double precision, y double precision)
 WHERE n.id = m.id AND n.owner_id = $1 AND n.removed_at IS NULL`;

export const moveNodes = async (
  sql: AppSql,
  ownerId: string,
  moves: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
  }[]
): Promise<void> => {
  if (moves.length === 0) {
    return;
  }
  await sql(MOVE_NODES, [ownerId, JSON.stringify(moves)]);
};

/** $1 node, $2 owner, $3 settings, $4 ids to mark stale, $5 pick or null to
 * keep. Writes the settings and marks what they make stale together. */
const UPDATE_SETTINGS = `
WITH n AS (
  UPDATE app_nodes SET settings = $3::jsonb,
         pick_asset_id = CASE WHEN $5::boolean THEN $6::text ELSE pick_asset_id END,
         updated_at = now()
   WHERE id = $1 AND owner_id = $2 AND removed_at IS NULL
  RETURNING id, board_id
), s AS (
  UPDATE app_nodes SET stale = true, updated_at = now()
   WHERE id = ANY($4::text[]) AND owner_id = $2 AND removed_at IS NULL
     AND EXISTS (SELECT 1 FROM n)
  RETURNING id
), b AS (
  UPDATE app_boards SET updated_at = now() WHERE id = (SELECT board_id FROM n)
  RETURNING id
)
SELECT (SELECT count(*) FROM n)::int AS updated`;

export const updateSettings = async (
  sql: AppSql,
  ownerId: string,
  nodeId: string,
  settings: KindSettings["settings"],
  staleIds: readonly string[],
  pick?: { readonly assetId: string | null }
): Promise<boolean> => {
  const [row] = await sql(UPDATE_SETTINGS, [
    nodeId,
    ownerId,
    JSON.stringify(settings),
    [...staleIds],
    pick !== undefined,
    pick?.assetId ?? null,
  ]);
  return row !== undefined && integer(row, "updated") > 0;
};

/** $1 node, $2 owner, $3 asset, $4 ids to mark stale. The Pick must be an
 * image the node made (or, for a Source, the person's own image). */
const SET_PICK = `
WITH n AS (
  UPDATE app_nodes SET pick_asset_id = $3, updated_at = now()
   WHERE id = $1 AND owner_id = $2 AND removed_at IS NULL
     AND (
       (kind = 'source' AND EXISTS (
          SELECT 1 FROM app_assets a WHERE a.id = $3 AND a.owner_id = $2 AND a.kind <> 'mask'))
       OR EXISTS (
          SELECT 1 FROM app_node_results r JOIN app_generations g ON g.id = r.generation_id
           WHERE r.node_id = $1 AND r.owner_id = $2 AND g.owner_id = $2
             AND g.status = 'completed' AND g.output_asset_ids @> jsonb_build_array($3::text))
     )
  RETURNING id
), s AS (
  UPDATE app_nodes SET stale = true, updated_at = now()
   WHERE id = ANY($4::text[]) AND owner_id = $2 AND removed_at IS NULL
     AND EXISTS (SELECT 1 FROM n)
  RETURNING id
)
SELECT (SELECT count(*) FROM n)::int AS updated`;

export const setPick = async (
  sql: AppSql,
  ownerId: string,
  nodeId: string,
  assetId: string,
  staleIds: readonly string[]
): Promise<boolean> => {
  const [row] = await sql(SET_PICK, [nodeId, ownerId, assetId, [...staleIds]]);
  return row !== undefined && integer(row, "updated") > 0;
};

const REMOVE_NODE = `
WITH n AS (
  UPDATE app_nodes SET removed_at = now(), updated_at = now()
   WHERE id = $1 AND owner_id = $2 AND removed_at IS NULL
  RETURNING id
), w AS (
  UPDATE app_wires SET removed_at = now()
   WHERE owner_id = $2 AND removed_at IS NULL
     AND (from_node_id = $1 OR to_node_id = $1) AND EXISTS (SELECT 1 FROM n)
  RETURNING id
)
SELECT (SELECT count(*) FROM n)::int AS removed`;

export const removeNode = async (
  sql: AppSql,
  ownerId: string,
  nodeId: string
): Promise<boolean> => {
  const [row] = await sql(REMOVE_NODE, [nodeId, ownerId]);
  return row !== undefined && integer(row, "removed") > 0;
};

/** A node has one input: a new wire replaces whatever fed it. Both ends
 * must be the owner's live nodes on this Board. */
const CLEAR_INPUT = `
UPDATE app_wires SET removed_at = now()
 WHERE to_node_id = $1 AND owner_id = $2 AND removed_at IS NULL`;

const ADD_WIRE = `
INSERT INTO app_wires (id, board_id, owner_id, from_node_id, to_node_id)
SELECT $1, $2, $5, $3, $4
 WHERE (SELECT count(*) FROM app_nodes
         WHERE id IN ($3, $4) AND board_id = $2 AND owner_id = $5 AND removed_at IS NULL) = 2
RETURNING id, from_node_id, to_node_id`;

export const addWire = async (
  sql: AppSql,
  ownerId: string,
  boardId: string,
  from: string,
  to: string,
  staleIds: readonly string[]
): Promise<BoardWire | null> => {
  await sql(CLEAR_INPUT, [to, ownerId]);
  const [row] = await sql(ADD_WIRE, [newId("wir"), boardId, from, to, ownerId]);
  if (row === undefined) {
    return null;
  }
  await markStale(sql, ownerId, staleIds);
  return wireOf(row);
};

const REMOVE_WIRE = `
UPDATE app_wires SET removed_at = now()
 WHERE id = $1 AND owner_id = $2 AND removed_at IS NULL
RETURNING id, from_node_id, to_node_id`;

export const removeWire = async (
  sql: AppSql,
  ownerId: string,
  wireId: string
): Promise<BoardWire | null> => {
  const [row] = await sql(REMOVE_WIRE, [wireId, ownerId]);
  return row === undefined ? null : wireOf(row);
};

const MARK_STALE = `
UPDATE app_nodes SET stale = true, updated_at = now()
 WHERE id = ANY($1::text[]) AND owner_id = $2 AND removed_at IS NULL`;

export const markStale = async (
  sql: AppSql,
  ownerId: string,
  ids: readonly string[]
): Promise<void> => {
  if (ids.length === 0) {
    return;
  }
  await sql(MARK_STALE, [[...ids], ownerId]);
};

// ── Results ───────────────────────────────────────────────────────────

const RECORD_RESULT = `
INSERT INTO app_node_results (generation_id, node_id, board_id, owner_id, run_id)
SELECT g.id, n.id, n.board_id, $3, $4
  FROM app_generations g, app_nodes n
 WHERE g.id = $1 AND g.owner_id = $3 AND n.id = $2 AND n.owner_id = $3
ON CONFLICT (generation_id) DO NOTHING`;

/** Note that a node made a Generation. Repeating it changes nothing. */
export const recordResult = async (
  sql: AppSql,
  ownerId: string,
  nodeId: string,
  generationId: string,
  runId: string | null
): Promise<void> => {
  await sql(RECORD_RESULT, [generationId, nodeId, ownerId, runId]);
};

const COMPLETE_NODE = `
UPDATE app_nodes SET pick_asset_id = $3, stale = false, updated_at = now()
 WHERE id = $1 AND owner_id = $2 AND removed_at IS NULL
   AND (NOT $4::boolean OR pick_asset_id IS NOT DISTINCT FROM $5::text)
RETURNING id`;

/** A node ran: its new result is the Pick, and it is no longer Stale. */
export const completeNode = async (
  sql: AppSql,
  ownerId: string,
  nodeId: string,
  pickAssetId: string,
  expectedPick?: string | null
): Promise<boolean> => {
  const rows = await sql(COMPLETE_NODE, [
    nodeId,
    ownerId,
    pickAssetId,
    expectedPick !== undefined,
    expectedPick ?? null,
  ]);
  return rows.length > 0;
};

const NODE_RESULTS = `
SELECT r.node_id, r.generation_id, r.run_id FROM app_node_results r
 WHERE r.board_id = $1 AND r.owner_id = $2
 ORDER BY r.created_at ASC`;

export interface NodeResult {
  readonly generationId: string;
  readonly nodeId: string;
  readonly runId: string | null;
}

export const listResults = async (
  sql: AppSql,
  ownerId: string,
  boardId: string
): Promise<NodeResult[]> => {
  const rows = await sql(NODE_RESULTS, [boardId, ownerId]);
  return rows.map((row) => ({
    generationId: text(row, "generation_id"),
    nodeId: text(row, "node_id"),
    runId: textOrNull(row, "run_id"),
  }));
};
