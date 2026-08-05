import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });

/**
 * One benchmark run: a spec (prompt, aspect, models, sampling) executed
 * against fal, with cost tracked reserve → refine → actual per the
 * two-phase ledger (`docs/arc/bench/BRIEF.md` rule 5).
 */
export const benchRuns = pgTable(
  "bench_runs",
  {
    aspect: text("aspect").notNull(),
    // Prompt + aspect + resolution + sorted models + alignment schema
    // version. Changing alignment behavior requires a version bump.
    cohortHash: text("cohort_hash").notNull(),
    completedAt: timestamptz("completed_at"),
    concurrency: integer("concurrency").notNull(),
    costActualMicros: integer("cost_actual_micros"),
    costEstimatedMicros: integer("cost_estimated_micros").notNull(),
    costReservedMicros: integer("cost_reserved_micros"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    // Every mock run is flagged so fake data cannot pollute longitudinal
    // stats (BRIEF.md rule 6).
    isMock: boolean("is_mock").notNull().default(false),
    mastraRunId: text("mastra_run_id"),
    models: jsonb("models").$type<string[]>().notNull(),
    prompt: text("prompt").notNull(),
    resolution: text("resolution").notNull(),
    samplesPerModel: integer("samples_per_model").notNull(),
    sdkVersion: text("sdk_version").notNull(),
    seed: integer("seed"),
    // Full run spec, including derived timeout floors and alignment
    // decisions — the run-level source of truth.
    spec: jsonb("spec").$type<Record<string, unknown>>().notNull(),
    startedAt: timestamptz("started_at"),
    status: text("status").notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("bench_runs_status_idx").on(table.status),
    index("bench_runs_cohort_hash_idx").on(table.cohortHash),
    check(
      "bench_runs_status_check",
      sql`${table.status} in ('pending', 'running', 'completed', 'partial', 'failed', 'cancelled')`
    ),
    check("bench_runs_concurrency_check", sql`${table.concurrency} >= 1`),
    check(
      "bench_runs_samples_per_model_check",
      sql`${table.samplesPerModel} >= 1`
    ),
    check(
      "bench_runs_models_array_check",
      sql`jsonb_typeof(${table.models}) = 'array'`
    ),
    check(
      "bench_runs_spec_object_check",
      sql`jsonb_typeof(${table.spec}) = 'object'`
    ),
    check(
      "bench_runs_cost_estimated_micros_check",
      sql`${table.costEstimatedMicros} >= 0`
    ),
    check(
      "bench_runs_cost_reserved_micros_check",
      sql`${table.costReservedMicros} >= 0`
    ),
    check(
      "bench_runs_cost_actual_micros_check",
      sql`${table.costActualMicros} >= 0`
    ),
  ]
);

/**
 * One generated sample within a run: provenance of the exact request sent,
 * timing, the downloaded image, and cost. Fal CDN URLs expire, so the image
 * is downloaded and temp-write-then-renamed *before* the row lands — this
 * table never stores a fal URL as the image's source of truth.
 */
export const benchSamples = pgTable(
  "bench_samples",
  {
    bytes: integer("bytes"),
    // Per-param coercions applied to honor the requested spec on a model
    // that cannot take it literally (e.g. aspect-ratio dialect coercion).
    coercedParams: jsonb("coerced_params").$type<Record<string, unknown>>(),
    contentType: text("content_type"),
    // `falPricing.unit` this sample's cost was derived from: images,
    // megapixels, processed megapixels, compute seconds, or units. Never a
    // hardcoded alias list (BRIEF.md verified ground truth).
    costBasis: text("cost_basis"),
    costEstimatedMicros: integer("cost_estimated_micros"),
    costRefinedMicros: integer("cost_refined_micros"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    downloadMs: integer("download_ms"),
    droppedParams: jsonb("dropped_params").$type<string[]>(),
    endpoint: text("endpoint").notNull(),
    // Closed error vocabulary (BRIEF.md rule 2) — provider text never
    // reaches this column.
    errorCode: text("error_code"),
    executionOrdinal: integer("execution_ordinal").notNull(),
    falRequestId: text("fal_request_id"),
    height: integer("height"),
    id: text("id").primaryKey(),
    imagePath: text("image_path"),
    modelAlias: text("model_alias").notNull(),
    modelName: text("model_name"),
    providerMs: integer("provider_ms"),
    // `gpt2` polls the queue every 3000ms; providerMs carries ±3s
    // granularity for queued samples — badge in any UI, exclude from tight
    // comparisons.
    queuePolled: boolean("queue_polled").notNull().default(false),
    // The exact request body sent to fal. Never a prompt/URL/image — those
    // are looked up via the run, not duplicated here as span-unsafe text.
    requestBody: jsonb("request_body")
      .$type<Record<string, unknown>>()
      .notNull(),
    runId: text("run_id")
      .notNull()
      .references(() => benchRuns.id, { onDelete: "restrict" }),
    sampleIndex: integer("sample_index").notNull(),
    /* fal returns UNSIGNED 32-bit seeds (up to 4,294,967,295) but Postgres
       `integer` is signed int4, max 2,147,483,647. qwen returned 4258306349
       and the write failed with "out of range for type integer", stranding the
       sample at pending after the image had been generated and paid for.
       bigint in number mode is exact to 2^53, far beyond any seed. */
    seedReturned: bigint("seed_returned", { mode: "number" }),
    seedSent: bigint("seed_sent", { mode: "number" }),
    /* The moment this sample was handed to the engine — NOT when its row was
       written. Every sample of a run is inserted in one batch, so `createdAt`
       is the same instant for all of them and says nothing about when any
       one of them actually began.

       It exists so the UI can count a sample's elapsed time up while it is
       still in the air, and it is deliberately a timestamp rather than a
       `running` status: `finalizeRunIfDone` waits on `status = 'pending'`
       alone, so a third live status would let a run finalise with a sample
       still generating. `started_at is not null and status = 'pending'`
       means in flight, and the state machine is untouched.

       Also the only record of queue wait (`started_at - created_at`) once
       something actually enforces `concurrency`. */
    startedAt: timestamptz("started_at"),
    status: text("status").notNull(),
    totalMs: integer("total_ms"),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
    width: integer("width"),
  },
  (table) => [
    index("bench_samples_run_id_idx").on(table.runId),
    unique("bench_samples_run_model_sample_unique").on(
      table.runId,
      table.modelAlias,
      table.sampleIndex
    ),
    check(
      "bench_samples_status_check",
      sql`${table.status} in ('pending', 'running', 'completed', 'failed')`
    ),
    check(
      "bench_samples_error_code_check",
      sql`${table.errorCode} is null or ${table.errorCode} in ('TIMEOUT', 'RATE_LIMITED', 'HTTP_4XX', 'HTTP_5XX', 'SAFETY', 'NO_IMAGE', 'DOWNLOAD_FAILED', 'INTERRUPTED')`
    ),
    check(
      "bench_samples_request_body_object_check",
      sql`jsonb_typeof(${table.requestBody}) = 'object'`
    ),
    check(
      "bench_samples_coerced_params_object_check",
      sql`${table.coercedParams} is null or jsonb_typeof(${table.coercedParams}) = 'object'`
    ),
    check(
      "bench_samples_dropped_params_array_check",
      sql`${table.droppedParams} is null or jsonb_typeof(${table.droppedParams}) = 'array'`
    ),
    check("bench_samples_sample_index_check", sql`${table.sampleIndex} >= 0`),
    check(
      "bench_samples_execution_ordinal_check",
      sql`${table.executionOrdinal} >= 0`
    ),
    check("bench_samples_bytes_check", sql`${table.bytes} >= 0`),
    check("bench_samples_width_check", sql`${table.width} >= 0`),
    check("bench_samples_height_check", sql`${table.height} >= 0`),
    check("bench_samples_provider_ms_check", sql`${table.providerMs} >= 0`),
    check("bench_samples_download_ms_check", sql`${table.downloadMs} >= 0`),
    check("bench_samples_total_ms_check", sql`${table.totalMs} >= 0`),
    check(
      "bench_samples_cost_estimated_micros_check",
      sql`${table.costEstimatedMicros} >= 0`
    ),
    check(
      "bench_samples_cost_refined_micros_check",
      sql`${table.costRefinedMicros} >= 0`
    ),
  ]
);

/**
 * A judge's scoring pass over one sample against a rubric version.
 * Unique on (sample, judge, rubric, version) so re-judging the same rubric
 * version upserts instead of duplicating rows.
 */
export const benchJudgments = pgTable(
  "bench_judgments",
  {
    costMicros: integer("cost_micros"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    critique: text("critique"),
    id: text("id").primaryKey(),
    judgeModel: text("judge_model").notNull(),
    // Per-criterion levels, keyed by rubric criterion id.
    levels: jsonb("levels").$type<Record<string, unknown>>().notNull(),
    // Geometric mean of per-criterion levels (see `judge-render.ts`
    // precedent). Null while `status` is `not-run`.
    overall: doublePrecision("overall"),
    rubricId: text("rubric_id").notNull(),
    rubricVersion: integer("rubric_version").notNull(),
    sampleId: text("sample_id")
      .notNull()
      .references(() => benchSamples.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("bench_judgments_sample_id_idx").on(table.sampleId),
    unique("bench_judgments_sample_judge_rubric_version_unique").on(
      table.sampleId,
      table.judgeModel,
      table.rubricId,
      table.rubricVersion
    ),
    check(
      "bench_judgments_status_check",
      sql`${table.status} in ('scored', 'inconclusive', 'not-run')`
    ),
    check(
      "bench_judgments_levels_object_check",
      sql`jsonb_typeof(${table.levels}) = 'object'`
    ),
    check(
      "bench_judgments_rubric_version_check",
      sql`${table.rubricVersion} >= 1`
    ),
    check("bench_judgments_cost_micros_check", sql`${table.costMicros} >= 0`),
  ]
);

/** A human 1–5 star rating + optional note for one sample. */
export const benchManualRatings = pgTable(
  "bench_manual_ratings",
  {
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    note: text("note"),
    sampleId: text("sample_id")
      .primaryKey()
      .references(() => benchSamples.id, { onDelete: "restrict" }),
    stars: integer("stars").notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "bench_manual_ratings_stars_check",
      sql`${table.stars} >= 1 and ${table.stars} <= 5`
    ),
  ]
);
