/**
 * The monthly cap, held in Postgres: one pot for every member, shown
 * privately (see `spendFor`).
 *
 * Every change is one SQL statement, so it is atomic on its own: a statement
 * whose data-modifying CTEs reserve against the month row and insert the hold
 * rows either does both or neither. Concurrency comes from the month row's
 * lock. Two reservations racing for the last of the cap queue on that row,
 * and Postgres re-checks the cap condition against the row as the first one
 * left it, so between them they can never hold more than the cap.
 *
 * Holds are keyed by member and idempotency key with a unique index. A repeated key
 * reserves nothing: either the first statement already inserted it, or two
 * arrived together and the second fails on the index, rolling back its whole
 * statement, reservation included.
 *
 * A hold leaves `held` only by settling: with a recorded cost, with its whole
 * bound when the cost can't be known, or released at zero when the provider
 * definitely refused the request before accepting it. Nothing releases a hold
 * because a request timed out or a connection dropped.
 */

import type { AppSql } from "@motif/bench-db/app-sql";

import { integer, text } from "../rows";
import { MONTHLY_CAP_MICROS } from "./policy";

/** The UTC calendar month a hold belongs to, as `YYYY-MM`. */
export const monthOf = (at: Date): string => at.toISOString().slice(0, 7);

export interface MonthSummary {
  readonly capMicros: number;
  readonly heldMicros: number;
  readonly month: string;
  readonly spentMicros: number;
  /** Per person: spent, held and run count this month. */
  readonly members: readonly {
    readonly heldMicros: number;
    readonly memberId: string;
    readonly runs: number;
    readonly spentMicros: number;
    /** Holds counted at their bound because the cost can't be known. */
    readonly retained: number;
  }[];
}

const SUMMARY = `
SELECT COALESCE((SELECT monthly_cap_micros FROM app_settings WHERE id = 'app'), $2::bigint) AS cap_micros,
       COALESCE((SELECT held_micros FROM app_budget_months WHERE month = $1), 0)::bigint AS held_micros,
       COALESCE((SELECT spent_micros FROM app_budget_months WHERE month = $1), 0)::bigint AS spent_micros`;

const BY_MEMBER = `
SELECT member_id,
       count(*)::int AS runs,
       COALESCE(sum(bound_micros) FILTER (WHERE status = 'held'), 0)::bigint AS held_micros,
       COALESCE(sum(settled_micros) FILTER (WHERE status <> 'held'), 0)::bigint AS spent_micros,
       count(*) FILTER (WHERE status = 'retained')::int AS retained
  FROM app_holds WHERE month = $1
 GROUP BY member_id`;

export const monthSummary = async (
  sql: AppSql,
  at: Date = new Date()
): Promise<MonthSummary> => {
  const month = monthOf(at);
  const [[totals], members] = await Promise.all([
    sql(SUMMARY, [month, MONTHLY_CAP_MICROS]),
    sql(BY_MEMBER, [month]),
  ]);
  return {
    capMicros:
      totals === undefined ? MONTHLY_CAP_MICROS : integer(totals, "cap_micros"),
    heldMicros: totals === undefined ? 0 : integer(totals, "held_micros"),
    members: members.map((row) => ({
      heldMicros: integer(row, "held_micros"),
      memberId: text(row, "member_id"),
      retained: integer(row, "retained"),
      runs: integer(row, "runs"),
      spentMicros: integer(row, "spent_micros"),
    })),
    month,
    spentMicros: totals === undefined ? 0 : integer(totals, "spent_micros"),
  };
};

/** One person's spending this month, as they may see it. */
export interface SpendView {
  readonly capMicros: number;
  /** What is left in the pot this month, after everyone's spend and holds. */
  readonly leftMicros: number;
  readonly month: string;
  readonly mine: {
    readonly heldMicros: number;
    /** Runs counted at their hold because fal reported no cost. */
    readonly estimated: number;
    readonly runs: number;
    readonly spentMicros: number;
  };
  /** The pot's total and everyone's lines: the owner's alone. */
  readonly pot: {
    readonly heldMicros: number;
    readonly spentMicros: number;
    readonly members: MonthSummary["members"];
  } | null;
}

/**
 * The month as one person may see it. One pot covers everyone (Daniel's
 * decision, 1 November 2026, MOT-74: "one pot, shown privately"): each
 * person sees their own spend and what is left; only the owner sees the
 * pot's total and other people's figures.
 */
export const spendFor = (
  summary: MonthSummary,
  member: { readonly id: string; readonly role: "member" | "owner" }
): SpendView => {
  const line = summary.members.find((entry) => entry.memberId === member.id);
  return {
    capMicros: summary.capMicros,
    leftMicros: Math.max(
      0,
      summary.capMicros - summary.spentMicros - summary.heldMicros
    ),
    mine: {
      estimated: line?.retained ?? 0,
      heldMicros: line?.heldMicros ?? 0,
      runs: line?.runs ?? 0,
      spentMicros: line?.spentMicros ?? 0,
    },
    month: summary.month,
    pot:
      member.role === "owner"
        ? {
            heldMicros: summary.heldMicros,
            members: summary.members,
            spentMicros: summary.spentMicros,
          }
        : null,
  };
};

const SET_CAP = `
INSERT INTO app_settings (id, monthly_cap_micros, updated_by, updated_at)
VALUES ('app', $1::bigint, $2, now())
ON CONFLICT (id) DO UPDATE
  SET monthly_cap_micros = excluded.monthly_cap_micros,
      updated_by = excluded.updated_by,
      updated_at = now()`;

/** The owner's monthly cap. Lowering it below what is already spent and held
 * stops new runs; it never cancels a hold. */
export const setMonthlyCap = async (
  sql: AppSql,
  capMicros: number,
  ownerMemberId: string
): Promise<void> => {
  if (!Number.isSafeInteger(capMicros) || capMicros < 0) {
    throw new RangeError(
      "The cap must be a whole number of micros, zero or more."
    );
  }
  await sql(SET_CAP, [capMicros, ownerMemberId]);
};
