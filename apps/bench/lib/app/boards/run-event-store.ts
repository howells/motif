/**
 * The beats a run has made, kept in `app_run_events`. One statement per
 * beat, scoped to the owner like every Board statement: the sequence number
 * is taken inside the statement, a repeat of the run's last beat is skipped,
 * and a run that is full takes only the beats that say how it ended.
 */
import type { AppRow, AppSql } from "@motif/bench-db/app-sql";

import { date, integer, text, textOrNull } from "../rows";
import {
  EVENTS_PER_RUN,
  RunEventDataSchema,
  TERMINAL_EXTRA,
  isTerminal,
  RUN_EVENT_KINDS,
} from "./run-events";
import type { Beat, RunEventInput } from "./run-events";

const APPEND = `
WITH last AS (
  SELECT seq, node_id, kind, text FROM app_run_events
   WHERE run_id = $1 ORDER BY seq DESC LIMIT 1
), total AS (
  SELECT count(*) AS n FROM app_run_events WHERE run_id = $1
)
INSERT INTO app_run_events (owner_id, run_id, node_id, seq, kind, text, data)
SELECT $2, r.id, $3::text, COALESCE((SELECT seq FROM last), 0) + 1, $4::text, $5::text, $6::jsonb
  FROM app_board_runs r
 WHERE r.id = $1 AND r.owner_id = $2
   AND (SELECT n FROM total) < $7::int
   AND NOT EXISTS (
     SELECT 1 FROM last
      WHERE last.node_id IS NOT DISTINCT FROM $3::text
        AND last.kind = $4::text AND last.text = $5::text
   )
ON CONFLICT (run_id, seq) DO NOTHING
RETURNING seq`;

const COUNT = `SELECT count(*) AS n FROM app_run_events WHERE run_id = $1 AND owner_id = $2`;

/** Another writer took the number first; try again with the next. */
const ATTEMPTS = 3;

export type Appended = "written" | "skipped" | "full";

/** Keep one beat. `skipped` is a repeat of the last beat, `full` a run that
 * has used its places. */
export const appendRunEvent = async (
  sql: AppSql,
  ownerId: string,
  runId: string,
  event: RunEventInput
): Promise<Appended> => {
  const limit = isTerminal(event.kind)
    ? EVENTS_PER_RUN + TERMINAL_EXTRA
    : EVENTS_PER_RUN;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const rows = await sql(APPEND, [
      runId,
      ownerId,
      event.nodeId,
      event.kind,
      event.text,
      event.data === undefined ? null : JSON.stringify(event.data),
      limit,
    ]);
    if (rows.length > 0) {
      return "written";
    }
    const [counted] = await sql(COUNT, [runId, ownerId]);
    if (counted !== undefined && integer(counted, "n") >= limit) {
      return "full";
    }
  }
  return "skipped";
};

const AFTER = `
SELECT seq, node_id, kind, text, data, created_at FROM app_run_events
 WHERE run_id = $1 AND owner_id = $2 AND seq > $3
 ORDER BY seq ASC LIMIT $4`;

const beatOf = (row: AppRow): Beat => {
  const kind = text(row, "kind");
  const found = RUN_EVENT_KINDS.find((item) => item === kind);
  if (found === undefined) {
    throw new TypeError(`Unknown run event kind ${kind}.`);
  }
  const data = row.data;
  const read =
    data === null || data === undefined ? null : RunEventDataSchema.parse(data);
  return {
    at: date(row, "created_at").toISOString(),
    data: read,
    kind: found,
    nodeId: textOrNull(row, "node_id"),
    seq: integer(row, "seq"),
    text: text(row, "text"),
  };
};

/** The beats after `after`, oldest first, at most `limit` of them. */
export const listRunEventsAfter = async (
  sql: AppSql,
  ownerId: string,
  runId: string,
  after: number,
  limit: number
): Promise<Beat[]> => {
  const rows = await sql(AFTER, [runId, ownerId, after, limit]);
  return rows.map((row) => beatOf(row));
};
