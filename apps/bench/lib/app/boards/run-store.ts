/**
 * The runs made on Boards: what was approved, in what order, and how each
 * ended. Scoped to the owner in SQL like every Board statement, and leased
 * so one worker drives a run at a time.
 */
import type { AppRow, AppSql } from "@motif/bench-db/app-sql";
import { z } from "zod";

import { newId } from "../ids";
import { date, dateOrNull, integer, text, textOrNull } from "../rows";
import type { RunScope } from "./model";
import { GraphSnapshotSchema } from "./snapshot";
import type { Graph, NodeResult } from "./store";

export type BoardRunStatus = "completed" | "failed" | "running" | "stopped";

export interface RunStep {
  readonly nodeId: string;
  readonly level: number;
  readonly micros: number;
  readonly snapshot?: Graph;
}

export interface BoardRun {
  readonly approvedMicros: number;
  readonly boardId: string;
  readonly createdAt: Date;
  readonly errorMessage: string | null;
  readonly fromNodeId: string;
  readonly id: string;
  readonly leaseUntil: Date | null;
  readonly scope: RunScope;
  readonly status: BoardRunStatus;
  readonly steps: readonly RunStep[];
}

const STATUSES: readonly BoardRunStatus[] = [
  "completed",
  "failed",
  "running",
  "stopped",
];

const StepsSchema = z.array(
  z.object({
    level: z.number().int(),
    micros: z.number().int(),
    nodeId: z.string(),
    snapshot: GraphSnapshotSchema.optional(),
  })
);

const stepsOf = (row: AppRow): RunStep[] => {
  const read = StepsSchema.safeParse(row.steps);
  if (!read.success) {
    throw new TypeError("A run's steps are malformed.");
  }
  return read.data;
};

const runOf = (row: AppRow): BoardRun => {
  const status = text(row, "status");
  const found = STATUSES.find((item) => item === status);
  if (found === undefined) {
    throw new TypeError(`Unknown run status ${status}.`);
  }
  return {
    approvedMicros: integer(row, "approved_micros"),
    boardId: text(row, "board_id"),
    createdAt: date(row, "created_at"),
    errorMessage: textOrNull(row, "error_message"),
    fromNodeId: text(row, "from_node_id"),
    id: text(row, "id"),
    leaseUntil: dateOrNull(row, "lease_until"),
    scope: text(row, "scope") === "node" ? "node" : "downstream",
    status: found,
    steps: stepsOf(row),
  };
};

const RUN_COLUMNS = `id, board_id, from_node_id, scope, status, steps, approved_micros,
error_message, lease_until, created_at`;

const CREATE_RUN = `
INSERT INTO app_board_runs (id, owner_id, board_id, from_node_id, scope, status, steps,
  approved_micros, idempotency_key)
SELECT $1, $2, b.id, $4, $5, 'running', $6::jsonb, $7, $8
  FROM app_boards b WHERE b.id = $3 AND b.owner_id = $2
ON CONFLICT (owner_id, idempotency_key) DO NOTHING
RETURNING ${RUN_COLUMNS}`;

const RUN_BY_KEY = `
SELECT ${RUN_COLUMNS} FROM app_board_runs WHERE owner_id = $1 AND idempotency_key = $2`;

export interface NewRun {
  readonly boardId: string;
  readonly fromNodeId: string;
  readonly idempotencyKey: string;
  readonly scope: RunScope;
  readonly steps: readonly RunStep[];
}

/** Record an approved run, or return the one this key already made. */
export const createRun = async (
  sql: AppSql,
  ownerId: string,
  run: NewRun
): Promise<{ readonly run: BoardRun; readonly duplicate: boolean } | null> => {
  const approved = run.steps.reduce((sum, step) => sum + step.micros, 0);
  const [row] = await sql(CREATE_RUN, [
    newId("brun"),
    ownerId,
    run.boardId,
    run.fromNodeId,
    run.scope,
    JSON.stringify(run.steps),
    approved,
    run.idempotencyKey,
  ]);
  if (row !== undefined) {
    return { duplicate: false, run: runOf(row) };
  }
  const [existing] = await sql(RUN_BY_KEY, [ownerId, run.idempotencyKey]);
  return existing === undefined
    ? null
    : { duplicate: true, run: runOf(existing) };
};

/** A run already recorded under this key, if any. */
export const getRunByKey = async (
  sql: AppSql,
  ownerId: string,
  idempotencyKey: string
): Promise<BoardRun | null> => {
  const [row] = await sql(RUN_BY_KEY, [ownerId, idempotencyKey]);
  return row === undefined ? null : runOf(row);
};

const RUN_RESULTS = `
SELECT r.node_id, r.generation_id, r.run_id FROM app_node_results r
 WHERE r.run_id = $1 AND r.owner_id = $2
 ORDER BY r.created_at ASC`;

/** What a run has made so far, in the order it was reserved. */
export const listRunResults = async (
  sql: AppSql,
  ownerId: string,
  runId: string
): Promise<NodeResult[]> => {
  const rows = await sql(RUN_RESULTS, [runId, ownerId]);
  return rows.map((row) => ({
    generationId: text(row, "generation_id"),
    nodeId: text(row, "node_id"),
    runId: textOrNull(row, "run_id"),
  }));
};

const GET_RUN = `
SELECT ${RUN_COLUMNS} FROM app_board_runs WHERE id = $1 AND owner_id = $2`;

export const getOwnedRun = async (
  sql: AppSql,
  ownerId: string,
  runId: string
): Promise<BoardRun | null> => {
  const [row] = await sql(GET_RUN, [runId, ownerId]);
  return row === undefined ? null : runOf(row);
};

const LATEST_RUNS = `
SELECT DISTINCT ON (from_node_id) ${RUN_COLUMNS} FROM app_board_runs
 WHERE board_id = $1 AND owner_id = $2
 ORDER BY from_node_id, created_at DESC`;

/** The newest run started from each node of a Board. */
export const latestRuns = async (
  sql: AppSql,
  ownerId: string,
  boardId: string
): Promise<BoardRun[]> => {
  const rows = await sql(LATEST_RUNS, [boardId, ownerId]);
  return rows.map((row) => runOf(row));
};

/** How long one worker drives a run before a poll may take it over. */
export const RUN_LEASE_SECONDS = 300;

const CLAIM_RUN = `
UPDATE app_board_runs
   SET lease_until = now() + make_interval(secs => $3), updated_at = now()
 WHERE id = $1 AND owner_id = $2 AND status = 'running'
   AND (lease_until IS NULL OR lease_until < now())
RETURNING lease_until::text AS lease_token`;

export const claimRun = async (
  sql: AppSql,
  ownerId: string,
  runId: string
): Promise<string | null> => {
  const [row] = await sql(CLAIM_RUN, [runId, ownerId, RUN_LEASE_SECONDS]);
  return row === undefined ? null : text(row, "lease_token");
};

const RELEASE_RUN = `
UPDATE app_board_runs SET lease_until = NULL
 WHERE id = $1 AND lease_until = $2::timestamptz`;

export const releaseRun = async (
  sql: AppSql,
  runId: string,
  leaseToken: string
): Promise<void> => {
  await sql(RELEASE_RUN, [runId, leaseToken]);
};

const END_RUN = `
UPDATE app_board_runs
   SET status = $3, error_message = $4, lease_until = NULL, updated_at = now()
 WHERE id = $1 AND owner_id = $2 AND status = 'running'`;

export const endRun = async (
  sql: AppSql,
  ownerId: string,
  runId: string,
  status: Exclude<BoardRunStatus, "running">,
  errorMessage: string | null = null
): Promise<void> => {
  await sql(END_RUN, [runId, ownerId, status, errorMessage]);
};

const RUN_STATUS = `SELECT status FROM app_board_runs WHERE id = $1 AND owner_id = $2`;

export const runStatus = async (
  sql: AppSql,
  ownerId: string,
  runId: string
): Promise<BoardRunStatus | null> => {
  const [row] = await sql(RUN_STATUS, [runId, ownerId]);
  if (row === undefined) {
    return null;
  }
  return STATUSES.find((item) => item === text(row, "status")) ?? null;
};
