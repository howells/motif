import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * The signed-in App's tables (MOT-74). Separate from the Bench tables in
 * `./schema.ts`: legacy Bench rows have no owner and are never read, assigned
 * or exposed through the App.
 *
 * Money is integer micros in `bigint` columns ($1 = 1,000,000). Every state
 * column has a closed vocabulary enforced by a check constraint, so a status
 * the code doesn't know about cannot be written.
 *
 * The App's SQL lives in `apps/bench/lib/app/**` as single statements; these
 * definitions are the schema source drizzle-kit pushes, under the push guard
 * in `./schema-push-target.ts`. Nothing here runs a migration.
 */

const timestamptz = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });

const micros = (name: string) => bigint(name, { mode: "number" });

/** One person with access. The owner row is provisioned explicitly; nobody
 * becomes the owner by signing in first. */
export const appMembers = pgTable(
  "app_members",
  {
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    // Lower-cased; the address WorkOS verified at sign-in.
    email: text("email").notNull(),
    id: text("id").primaryKey(),
    invitationId: text("invitation_id"),
    name: text("name"),
    revokedAt: timestamptz("revoked_at"),
    role: text("role").notNull(),
    status: text("status").notNull(),
    workosUserId: text("workos_user_id").notNull(),
  },
  (table) => [
    uniqueIndex("app_members_workos_user_id_unique").on(table.workosUserId),
    uniqueIndex("app_members_one_owner")
      .on(table.role)
      .where(sql`${table.role} = 'owner'`),
    check("app_members_role_check", sql`${table.role} in ('owner', 'member')`),
    check(
      "app_members_status_check",
      sql`${table.status} in ('active', 'revoked')`
    ),
  ]
);

/** An invitation the owner sent through WorkOS. Accepting it — signing in
 * with the verified address — creates the member row. */
export const appInvitations = pgTable(
  "app_invitations",
  {
    acceptedAt: timestamptz("accepted_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    email: text("email").notNull(),
    id: text("id").primaryKey(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => appMembers.id, { onDelete: "restrict" }),
    revokedAt: timestamptz("revoked_at"),
    status: text("status").notNull(),
    workosInvitationId: text("workos_invitation_id"),
  },
  (table) => [
    uniqueIndex("app_invitations_one_pending_per_email")
      .on(table.email)
      .where(sql`${table.status} = 'pending'`),
    check(
      "app_invitations_status_check",
      sql`${table.status} in ('pending', 'accepted', 'revoked')`
    ),
  ]
);

/** Owner-editable application settings. One row, id 'app'. Absent means the
 * source defaults in `apps/bench/lib/app/budget/policy.ts`. */
export const appSettings = pgTable(
  "app_settings",
  {
    id: text("id").primaryKey(),
    monthlyCapMicros: micros("monthly_cap_micros").notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
    updatedBy: text("updated_by").references(() => appMembers.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    check("app_settings_single_row", sql`${table.id} = 'app'`),
    check("app_settings_cap_check", sql`${table.monthlyCapMicros} >= 0`),
  ]
);

/** One calendar month (UTC) of the shared cap. `held` is the sum of open
 * holds reserved this month; `spent` the sum of settled ones. A hold stays in
 * the month it was reserved in until it settles, so a rollover never drops
 * unsettled work. */
export const appBudgetMonths = pgTable(
  "app_budget_months",
  {
    heldMicros: micros("held_micros").notNull().default(0),
    month: text("month").primaryKey(),
    spentMicros: micros("spent_micros").notNull().default(0),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "app_budget_months_month_check",
      sql`${table.month} ~ '^\\d{4}-\\d{2}$'`
    ),
    check("app_budget_months_held_check", sql`${table.heldMicros} >= 0`),
    check("app_budget_months_spent_check", sql`${table.spentMicros} >= 0`),
  ]
);

/** A reservation of the most one provider call can cost, made before the
 * call. `settled_micros` is what was finally counted: the recorded cost, or
 * the whole bound when the cost can't be known. */
export const appHolds = pgTable(
  "app_holds",
  {
    boundMicros: micros("bound_micros").notNull(),
    costBasis: text("cost_basis"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    memberId: text("member_id")
      .notNull()
      .references(() => appMembers.id, { onDelete: "restrict" }),
    month: text("month")
      .notNull()
      .references(() => appBudgetMonths.month, { onDelete: "restrict" }),
    settledAt: timestamptz("settled_at"),
    settledMicros: micros("settled_micros"),
    status: text("status").notNull(),
  },
  (table) => [
    uniqueIndex("app_holds_member_idempotency_key_unique").on(
      table.memberId,
      table.idempotencyKey
    ),
    index("app_holds_month_status_idx").on(table.month, table.status),
    check(
      "app_holds_status_check",
      sql`${table.status} in ('held', 'settled', 'retained', 'released')`
    ),
    check("app_holds_bound_check", sql`${table.boundMicros} > 0`),
    check(
      "app_holds_settled_check",
      sql`${table.settledMicros} is null or ${table.settledMicros} >= 0`
    ),
  ]
);

/** A private image: an upload, a mask drawn in the App, or a Task's output.
 * Bytes live in the private Blob store at `blob_pathname`; they are served
 * only through the App's owner-checked media route. */
export const appAssets = pgTable(
  "app_assets",
  {
    blobPathname: text("blob_pathname").notNull(),
    bytes: integer("bytes").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    height: integer("height").notNull(),
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => appMembers.id, { onDelete: "restrict" }),
    sha256: text("sha256").notNull(),
    width: integer("width").notNull(),
  },
  (table) => [
    index("app_assets_owner_idx").on(table.ownerId, table.createdAt),
    check(
      "app_assets_kind_check",
      sql`${table.kind} in ('upload', 'mask', 'output')`
    ),
    check(
      "app_assets_content_type_check",
      sql`${table.contentType} in ('image/jpeg', 'image/png', 'image/webp')`
    ),
    check("app_assets_bytes_check", sql`${table.bytes} > 0`),
    check(
      "app_assets_size_check",
      sql`${table.width} > 0 and ${table.height} > 0`
    ),
  ]
);

/** One prompt sent to several Models. Its Generations carry its id. */
export const appComparisons = pgTable(
  "app_comparisons",
  {
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    models: jsonb("models").$type<string[]>().notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => appMembers.id, { onDelete: "restrict" }),
    prompt: text("prompt").notNull(),
  },
  (table) => [
    index("app_comparisons_owner_idx").on(table.ownerId, table.createdAt),
    check(
      "app_comparisons_models_array_check",
      sql`jsonb_typeof(${table.models}) = 'array'`
    ),
  ]
);

/**
 * One Task run, from reservation to result. A Generation is the completed
 * row; earlier states are the same row on its way there.
 *
 * `stack_id` groups a Generation with the Tasks run on it: a Task whose Source
 * is a Generation's output joins that Generation's stack, with `parent_id`
 * naming it. An upload starts a new stack.
 */
export const appGenerations = pgTable(
  "app_generations",
  {
    comparisonId: text("comparison_id").references(() => appComparisons.id, {
      onDelete: "restrict",
    }),
    completedAt: timestamptz("completed_at"),
    costBasis: text("cost_basis"),
    costMicros: micros("cost_micros"),
    costStatus: text("cost_status").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    endpoint: text("endpoint").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    holdId: text("hold_id")
      .notNull()
      .references(() => appHolds.id, { onDelete: "restrict" }),
    id: text("id").primaryKey(),
    // The App request as validated: Task options and asset ids, never bytes
    // or provider URLs.
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    leaseUntil: timestamptz("lease_until"),
    maskAssetId: text("mask_asset_id").references(() => appAssets.id, {
      onDelete: "restrict",
    }),
    mode: text("mode"),
    model: text("model").notNull(),
    outputAssetIds: jsonb("output_asset_ids").$type<string[]>(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => appMembers.id, { onDelete: "restrict" }),
    parentId: text("parent_id"),
    prompt: text("prompt"),
    providerMs: integer("provider_ms"),
    referenceAssetIds: jsonb("reference_asset_ids").$type<string[]>().notNull(),
    requestId: text("request_id"),
    retryOf: text("retry_of"),
    sourceAssetId: text("source_asset_id").references(() => appAssets.id, {
      onDelete: "restrict",
    }),
    stackId: text("stack_id").notNull(),
    status: text("status").notNull(),
    submittedAt: timestamptz("submitted_at"),
    task: text("task").notNull(),
    tier: text("tier").notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("app_generations_owner_idx").on(table.ownerId, table.createdAt),
    index("app_generations_stack_idx").on(table.stackId, table.createdAt),
    index("app_generations_comparison_idx").on(table.comparisonId),
    uniqueIndex("app_generations_hold_unique").on(table.holdId),
    check(
      "app_generations_status_check",
      sql`${table.status} in ('reserved', 'submitting', 'submitted', 'completed', 'failed', 'unknown')`
    ),
    check(
      "app_generations_cost_status_check",
      sql`${table.costStatus} in ('held', 'settled', 'retained', 'released')`
    ),
    check(
      "app_generations_reference_ids_array_check",
      sql`jsonb_typeof(${table.referenceAssetIds}) = 'array'`
    ),
  ]
);
