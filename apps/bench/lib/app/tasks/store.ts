/**
 * Generations and their holds, one SQL statement per state change.
 *
 * Reserving a run is a single statement: it checks the shared cap against the
 * month row, raises `held`, inserts the holds and inserts the Generation rows
 * (and the Comparison, for one) together. If any part fails, nothing is
 * written, so there is never a hold without its Generation or a Generation
 * without its hold.
 *
 * Concurrency comes from the month row. Reservations queue on its lock, and
 * Postgres re-checks the cap condition against the row as the previous
 * reservation left it, so concurrent runs across every member can't hold more
 * than the cap between them. A repeated idempotency key for the same member reserves nothing:
 * either it is already there, or two arrived together and the second fails
 * on the unique index, rolling back its whole statement.
 *
 * Settling is also one statement: it moves the Generation to its end state
 * and replaces its hold, in `held`, with what is counted in `spent`: the
 * recorded cost, the whole bound when the cost can't be known, or nothing
 * when the provider refused the request before accepting it.
 */
import type { AppRow, AppSql } from "@motif/bench-db/app-sql";

import { monthOf } from "../budget/ledger";
import { MONTHLY_CAP_MICROS } from "../budget/policy";
import {
  date,
  dateOrNull,
  integer,
  integerOrNull,
  record,
  stringArray,
  text,
  textOrNull,
} from "../rows";

export type GenerationStatus =
  | "reserved"
  | "submitting"
  | "submitted"
  | "completed"
  | "failed"
  | "unknown";

export type CostStatus = "held" | "settled" | "retained" | "released";

export interface Generation {
  readonly boundMicros: number;
  readonly comparisonId: string | null;
  readonly completedAt: Date | null;
  readonly costBasis: string | null;
  readonly costMicros: number | null;
  readonly costStatus: CostStatus;
  readonly createdAt: Date;
  readonly data: Record<string, unknown>;
  readonly endpoint: string;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly holdId: string;
  readonly id: string;
  readonly input: Record<string, unknown>;
  readonly leaseUntil: Date | null;
  readonly maskAssetId: string | null;
  readonly mode: string | null;
  readonly model: string;
  readonly outputAssetIds: string[];
  readonly ownerId: string;
  readonly parentId: string | null;
  readonly prompt: string | null;
  readonly providerMs: number | null;
  readonly referenceAssetIds: string[];
  readonly requestId: string | null;
  readonly retryOf: string | null;
  readonly sourceAssetId: string | null;
  readonly stackId: string;
  readonly status: GenerationStatus;
  readonly submittedAt: Date | null;
  readonly task: string;
  readonly tier: string;
}

const STATUSES: readonly GenerationStatus[] = [
  "reserved",
  "submitting",
  "submitted",
  "completed",
  "failed",
  "unknown",
];
const COST_STATUSES: readonly CostStatus[] = [
  "held",
  "settled",
  "retained",
  "released",
];

const statusOf = (row: AppRow): GenerationStatus => {
  const value = text(row, "status");
  const found = STATUSES.find((status) => status === value);
  if (found === undefined) {
    throw new TypeError(`Unknown Generation status ${value}.`);
  }
  return found;
};

const costStatusOf = (row: AppRow): CostStatus => {
  const value = text(row, "cost_status");
  const found = COST_STATUSES.find((status) => status === value);
  if (found === undefined) {
    throw new TypeError(`Unknown cost status ${value}.`);
  }
  return found;
};

const COLUMNS = `
g.id, g.owner_id, g.task, g.status, g.stack_id, g.parent_id, g.comparison_id,
g.source_asset_id, g.reference_asset_ids, g.mask_asset_id, g.input, g.model, g.tier,
g.mode, g.endpoint, g.request_id, g.hold_id, g.output_asset_ids, g.data, g.cost_micros,
g.cost_basis, g.cost_status, g.error_code, g.error_message, g.retry_of, g.prompt,
g.provider_ms, g.created_at, g.submitted_at, g.completed_at, g.lease_until,
h.bound_micros`;

const generationOf = (row: AppRow): Generation => ({
  boundMicros: integer(row, "bound_micros"),
  comparisonId: textOrNull(row, "comparison_id"),
  completedAt: dateOrNull(row, "completed_at"),
  costBasis: textOrNull(row, "cost_basis"),
  costMicros: integerOrNull(row, "cost_micros"),
  costStatus: costStatusOf(row),
  createdAt: date(row, "created_at"),
  data: record(row, "data"),
  endpoint: text(row, "endpoint"),
  errorCode: textOrNull(row, "error_code"),
  errorMessage: textOrNull(row, "error_message"),
  holdId: text(row, "hold_id"),
  id: text(row, "id"),
  input: record(row, "input"),
  leaseUntil: dateOrNull(row, "lease_until"),
  maskAssetId: textOrNull(row, "mask_asset_id"),
  mode: textOrNull(row, "mode"),
  model: text(row, "model"),
  outputAssetIds: stringArray(row, "output_asset_ids"),
  ownerId: text(row, "owner_id"),
  parentId: textOrNull(row, "parent_id"),
  prompt: textOrNull(row, "prompt"),
  providerMs: integerOrNull(row, "provider_ms"),
  referenceAssetIds: stringArray(row, "reference_asset_ids"),
  requestId: textOrNull(row, "request_id"),
  retryOf: textOrNull(row, "retry_of"),
  sourceAssetId: textOrNull(row, "source_asset_id"),
  stackId: text(row, "stack_id"),
  status: statusOf(row),
  submittedAt: dateOrNull(row, "submitted_at"),
  task: text(row, "task"),
  tier: text(row, "tier"),
});

/** One Generation to reserve, with the hold that pays for it. */
export interface PlannedRun {
  readonly boundMicros: number;
  readonly comparisonId: string | null;
  readonly endpoint: string;
  readonly holdId: string;
  readonly id: string;
  readonly idempotencyKey: string;
  readonly input: Record<string, unknown>;
  readonly maskAssetId: string | null;
  readonly mode: string | null;
  readonly model: string;
  readonly ownerId: string;
  readonly parentId: string | null;
  readonly prompt: string | null;
  readonly referenceAssetIds: readonly string[];
  readonly retryOf: string | null;
  readonly sourceAssetId: string | null;
  readonly stackId: string;
  readonly task: string;
  readonly tier: string;
}

export interface PlannedComparison {
  readonly id: string;
  readonly input: Record<string, unknown>;
  readonly models: readonly string[];
  readonly ownerId: string;
  readonly prompt: string;
}

export type ReserveResult =
  | { readonly kind: "reserved"; readonly generationIds: readonly string[] }
  | { readonly kind: "duplicate"; readonly generationIds: readonly string[] }
  | {
      readonly kind: "cap";
      readonly availableMicros: number;
      readonly requestedMicros: number;
    };

const ENSURE_MONTH = `
INSERT INTO app_budget_months (month) VALUES ($1)
ON CONFLICT (month) DO NOTHING`;

/** $1 month, $2 runs as JSON, $3 comparison as JSON or null, $4 default cap. */
const RESERVE = `
WITH req AS (
  SELECT * FROM jsonb_to_recordset($2::jsonb) AS r(
    id text, hold_id text, idempotency_key text, owner_id text, bound_micros bigint,
    task text, model text, tier text, mode text, endpoint text, input jsonb,
    stack_id text, parent_id text, source_asset_id text, reference_asset_ids jsonb,
    mask_asset_id text, prompt text, retry_of text, comparison_id text)
), total AS (
  SELECT sum(bound_micros)::bigint AS micros FROM req
), dup AS (
  SELECT g.id FROM app_holds h JOIN app_generations g ON g.hold_id = h.id
   WHERE (h.member_id, h.idempotency_key) IN (
     SELECT owner_id, idempotency_key FROM req
   )
), upd AS (
  UPDATE app_budget_months b
     SET held_micros = b.held_micros + (SELECT micros FROM total),
         updated_at = now()
   WHERE b.month = $1
     AND NOT EXISTS (SELECT 1 FROM dup)
     AND b.spent_micros + b.held_micros + (SELECT micros FROM total)
         <= COALESCE((SELECT monthly_cap_micros FROM app_settings WHERE id = 'app'), $4::bigint)
  RETURNING b.month
), cmp AS (
  INSERT INTO app_comparisons (id, owner_id, prompt, models, input)
  SELECT c.id, c.owner_id, c.prompt, c.models, c.input
    FROM jsonb_to_record($3::jsonb) AS c(id text, owner_id text, prompt text, models jsonb, input jsonb)
   WHERE $3::jsonb IS NOT NULL AND EXISTS (SELECT 1 FROM upd)
  RETURNING id
), holds AS (
  INSERT INTO app_holds (id, idempotency_key, member_id, month, bound_micros, status)
  SELECT req.hold_id, req.idempotency_key, req.owner_id, upd.month, req.bound_micros, 'held'
    FROM req CROSS JOIN upd
  RETURNING id
), gens AS (
  INSERT INTO app_generations (
    id, owner_id, task, status, stack_id, parent_id, comparison_id, source_asset_id,
    reference_asset_ids, mask_asset_id, input, model, tier, mode, endpoint, hold_id,
    cost_status, prompt, retry_of)
  SELECT req.id, req.owner_id, req.task, 'reserved', req.stack_id, req.parent_id,
         req.comparison_id, req.source_asset_id, req.reference_asset_ids, req.mask_asset_id,
         req.input, req.model, req.tier, req.mode, req.endpoint, req.hold_id,
         'held', req.prompt, req.retry_of
    FROM req JOIN holds ON holds.id = req.hold_id
  RETURNING id
)
SELECT (SELECT coalesce(array_agg(id), '{}') FROM gens) AS generation_ids,
       (SELECT coalesce(array_agg(id), '{}') FROM dup) AS duplicate_ids,
       (SELECT count(*) FROM cmp)::int AS comparisons`;

const AVAILABLE = `
SELECT greatest(
         COALESCE((SELECT monthly_cap_micros FROM app_settings WHERE id = 'app'), $2::bigint)
         - COALESCE((SELECT spent_micros + held_micros FROM app_budget_months WHERE month = $1), 0),
         0)::bigint AS available_micros`;

const DUPLICATES = `
SELECT g.id FROM app_holds h JOIN app_generations g ON g.hold_id = h.id
 JOIN jsonb_to_recordset($1::jsonb) AS req(owner_id text, idempotency_key text)
   ON h.member_id = req.owner_id AND h.idempotency_key = req.idempotency_key`;

const UNIQUE_VIOLATION = "23505";

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === UNIQUE_VIOLATION;

const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const assertBound = (micros: number): void => {
  if (!Number.isSafeInteger(micros) || micros <= 0) {
    throw new RangeError(
      "Every run must hold a positive whole number of micros."
    );
  }
};

/** Reserve every run's hold and record every Generation, or do nothing. */
export const reserveRuns = async (
  sql: AppSql,
  runs: readonly PlannedRun[],
  comparison: PlannedComparison | null,
  at: Date = new Date()
): Promise<ReserveResult> => {
  if (runs.length === 0) {
    throw new RangeError("Nothing to reserve.");
  }
  for (const run of runs) {
    assertBound(run.boundMicros);
  }
  const month = monthOf(at);
  const requestedMicros = runs.reduce((sum, run) => sum + run.boundMicros, 0);
  const payload = runs.map((run) => ({
    bound_micros: run.boundMicros,
    comparison_id: run.comparisonId,
    endpoint: run.endpoint,
    hold_id: run.holdId,
    id: run.id,
    idempotency_key: run.idempotencyKey,
    input: run.input,
    mask_asset_id: run.maskAssetId,
    mode: run.mode,
    model: run.model,
    owner_id: run.ownerId,
    parent_id: run.parentId,
    prompt: run.prompt,
    reference_asset_ids: run.referenceAssetIds,
    retry_of: run.retryOf,
    source_asset_id: run.sourceAssetId,
    stack_id: run.stackId,
    task: run.task,
    tier: run.tier,
  }));
  const comparisonPayload =
    comparison === null
      ? null
      : JSON.stringify({
          id: comparison.id,
          input: comparison.input,
          models: comparison.models,
          owner_id: comparison.ownerId,
          prompt: comparison.prompt,
        });
  await sql(ENSURE_MONTH, [month]);
  try {
    const [row] = await sql(RESERVE, [
      month,
      JSON.stringify(payload),
      comparisonPayload,
      MONTHLY_CAP_MICROS,
    ]);
    if (row === undefined) {
      throw new Error("The reservation returned no row.");
    }
    const duplicates = ids(row.duplicate_ids);
    if (duplicates.length > 0) {
      return { generationIds: duplicates, kind: "duplicate" };
    }
    const created = ids(row.generation_ids);
    if (created.length === runs.length) {
      return { generationIds: created, kind: "reserved" };
    }
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const rows = await sql(DUPLICATES, [
      JSON.stringify(
        runs.map((run) => ({
          idempotency_key: run.idempotencyKey,
          owner_id: run.ownerId,
        }))
      ),
    ]);
    if (rows.length === 0) {
      throw error;
    }
    return {
      generationIds: rows.map((row) => text(row, "id")),
      kind: "duplicate",
    };
  }
  const [available] = await sql(AVAILABLE, [month, MONTHLY_CAP_MICROS]);
  return {
    availableMicros:
      available === undefined ? 0 : integer(available, "available_micros"),
    kind: "cap",
    requestedMicros,
  };
};

const SELECT_OWNED = `
SELECT ${COLUMNS} FROM app_generations g JOIN app_holds h ON h.id = g.hold_id
 WHERE g.id = $1 AND g.owner_id = $2`;

/** The owner's Generation, or `null` for another person's or a missing one. */
export const getOwnedGeneration = async (
  sql: AppSql,
  ownerId: string,
  id: string
): Promise<Generation | null> => {
  const [row] = await sql(SELECT_OWNED, [id, ownerId]);
  return row === undefined ? null : generationOf(row);
};

const SELECT_MANY_OWNED = `
SELECT ${COLUMNS} FROM app_generations g JOIN app_holds h ON h.id = g.hold_id
 WHERE g.id = ANY($1::text[]) AND g.owner_id = $2
 ORDER BY g.created_at ASC`;

export const getOwnedGenerations = async (
  sql: AppSql,
  ownerId: string,
  idList: readonly string[]
): Promise<Generation[]> => {
  const rows = await sql(SELECT_MANY_OWNED, [[...idList], ownerId]);
  return rows.map((row) => generationOf(row));
};

const PRODUCER = `
SELECT ${COLUMNS} FROM app_generations g JOIN app_holds h ON h.id = g.hold_id
 WHERE g.owner_id = $1 AND g.status = 'completed'
   AND g.output_asset_ids @> jsonb_build_array($2::text)
 LIMIT 1`;

/** The owner's Generation that produced an output asset: the parent of any
 * Task run on that output, and the stack it joins. */
export const findProducer = async (
  sql: AppSql,
  ownerId: string,
  assetId: string
): Promise<Generation | null> => {
  const [row] = await sql(PRODUCER, [ownerId, assetId]);
  return row === undefined ? null : generationOf(row);
};

/** How long one worker owns a Generation before another may take it over.
 * Every worker write also checks the exact lease it claimed, so a worker
 * that outlives this interval can't change its replacement's work. */
export const LEASE_SECONDS = 330;

const CLAIM = `
UPDATE app_generations
   SET lease_until = now() + make_interval(secs => $2), updated_at = now()
 WHERE id = $1 AND owner_id = $3
   AND status IN ('reserved', 'submitting', 'submitted')
   AND (lease_until IS NULL OR lease_until < now())
RETURNING lease_until::text AS lease_token`;

/** Claim a lease, preserving its full PostgreSQL timestamp precision as the
 * token for every later write. Another person's or an unavailable run has
 * no lease to claim. */
export const claimLease = async (
  sql: AppSql,
  id: string,
  ownerId: string
): Promise<string | null> => {
  const [row] = await sql(CLAIM, [id, LEASE_SECONDS, ownerId]);
  return row === undefined ? null : text(row, "lease_token");
};

const RELEASE_LEASE = `
UPDATE app_generations SET lease_until = NULL
 WHERE id = $1 AND lease_until = $2::timestamptz`;

export const releaseLease = async (
  sql: AppSql,
  id: string,
  leaseToken: string
): Promise<void> => {
  await sql(RELEASE_LEASE, [id, leaseToken]);
};

const MARK_SUBMITTING = `
UPDATE app_generations SET status = 'submitting', updated_at = now()
 WHERE id = $1 AND status = 'reserved'
   AND lease_until = $2::timestamptz AND lease_until > now()
RETURNING id`;

/** Move to `submitting` before calling the provider. Only one caller can win,
 * so a run is never sent twice. */
export const markSubmitting = async (
  sql: AppSql,
  id: string,
  leaseToken: string
): Promise<boolean> => {
  const rows = await sql(MARK_SUBMITTING, [id, leaseToken]);
  return rows.length > 0;
};

const RECORD_SUBMITTED = `
UPDATE app_generations
   SET status = 'submitted', request_id = $2, submitted_at = now(), updated_at = now()
 WHERE id = $1 AND status = 'submitting'
   AND lease_until = $3::timestamptz AND lease_until > now()`;

export const recordSubmitted = async (
  sql: AppSql,
  id: string,
  requestId: string,
  leaseToken: string
): Promise<void> => {
  await sql(RECORD_SUBMITTED, [id, requestId, leaseToken]);
};

/**
 * End a Generation and its hold together.
 *
 * `from` lists the states it may end from; a Generation already ended
 * elsewhere is left alone and `false` comes back. A hold can be settled from
 * `held`, or from `retained` once a cost that was unknown is recorded after
 * all, which lowers `spent` from the bound to the cost.
 * A worker must supply its lease token. Without one only an unleased row
 * can end, including a later correction to a retained cost.
 */
const SETTLE = `
WITH g AS (
  UPDATE app_generations
     SET status = $3,
         cost_status = $4,
         cost_micros = CASE $4 WHEN 'retained' THEN NULL ELSE $5::bigint END,
         cost_basis = $6,
         output_asset_ids = COALESCE($7::jsonb, output_asset_ids),
         data = COALESCE($8::jsonb, data),
         error_code = $9,
         error_message = $10,
         provider_ms = COALESCE($11::int, provider_ms),
         completed_at = CASE $3 WHEN 'completed' THEN now() ELSE completed_at END,
         lease_until = NULL,
         updated_at = now()
   WHERE id = $1 AND status = ANY($2::text[])
     AND (($12::timestamptz IS NULL AND lease_until IS NULL)
       OR (lease_until = $12::timestamptz AND lease_until > now()))
  RETURNING hold_id
), prev AS (
  SELECT h.id, h.status, h.month, h.bound_micros, COALESCE(h.settled_micros, 0) AS prev_settled
    FROM app_holds h
   WHERE h.id = (SELECT hold_id FROM g) AND h.status IN ('held', 'retained')
   FOR UPDATE
), h AS (
  UPDATE app_holds
     SET status = $4,
         settled_micros = CASE $4 WHEN 'retained' THEN prev.bound_micros ELSE $5::bigint END,
         cost_basis = $6,
         settled_at = now()
    FROM prev
   WHERE app_holds.id = prev.id
     AND NOT (prev.status = 'retained' AND $4 = 'retained')
  RETURNING app_holds.settled_micros, prev.status AS prev_status, prev.month,
            prev.bound_micros, prev.prev_settled
), b AS (
  UPDATE app_budget_months
     SET held_micros = held_micros - CASE WHEN h.prev_status = 'held' THEN h.bound_micros ELSE 0 END,
         spent_micros = spent_micros + h.settled_micros - h.prev_settled,
         updated_at = now()
    FROM h
   WHERE app_budget_months.month = h.month
  RETURNING 1
)
SELECT (SELECT count(*) FROM g)::int AS ended`;

export interface Ending {
  readonly status: "completed" | "failed" | "unknown";
  readonly cost:
    | {
        readonly kind: "settled";
        readonly micros: number;
        readonly basis: string;
      }
    | { readonly kind: "retained"; readonly basis: string }
    | { readonly kind: "released"; readonly basis: string };
  readonly outputAssetIds?: readonly string[];
  readonly data?: Record<string, unknown>;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly providerMs?: number;
}

export const endGeneration = async (
  sql: AppSql,
  id: string,
  from: readonly GenerationStatus[],
  ending: Ending,
  leaseToken: string | null = null
): Promise<boolean> => {
  let micros = 0;
  if (ending.cost.kind === "settled") {
    if (!Number.isSafeInteger(ending.cost.micros) || ending.cost.micros < 0) {
      throw new RangeError(
        "A recorded cost must be a whole number of micros, zero or more."
      );
    }
    micros = ending.cost.micros;
  }
  const [row] = await sql(SETTLE, [
    id,
    [...from],
    ending.status,
    ending.cost.kind,
    micros,
    ending.cost.basis,
    ending.outputAssetIds === undefined
      ? null
      : JSON.stringify(ending.outputAssetIds),
    ending.data === undefined ? null : JSON.stringify(ending.data),
    ending.errorCode ?? null,
    ending.errorMessage ?? null,
    ending.providerMs ?? null,
    leaseToken,
  ]);
  return row !== undefined && integer(row, "ended") > 0;
};
