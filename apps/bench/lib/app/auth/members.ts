/**
 * Who may use the App, decided in the App's own database on every request.
 *
 * WorkOS proves who someone is; this module decides whether that person has
 * access. Access comes only from an owner-provisioned owner row or an
 * invitation the owner sent, accepted by signing in with the invited,
 * verified address. Signing in first grants nothing. A revoked member is
 * refused at the next request, whatever their session says.
 */

import type { AppRow, AppSql } from "@motif/bench-db/app-sql";

import { newId } from "../ids";
import { date, dateOrNull, text, textOrNull } from "../rows";

export interface Identity {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | null;
  readonly workosUserId: string;
}

export type Role = "member" | "owner";

export interface Member {
  readonly email: string;
  readonly id: string;
  readonly name: string | null;
  readonly role: Role;
}

export type Access =
  | { readonly kind: "member"; readonly member: Member }
  | { readonly kind: "revoked" }
  | { readonly kind: "not-invited" };

const normaliseEmail = (email: string): string => email.trim().toLowerCase();

const roleOf = (row: AppRow): Role =>
  text(row, "role") === "owner" ? "owner" : "member";

const memberOf = (row: AppRow): Member => ({
  email: text(row, "email"),
  id: text(row, "id"),
  name: textOrNull(row, "name"),
  role: roleOf(row),
});

const FIND = `
SELECT id, email, name, role, status FROM app_members WHERE workos_user_id = $1`;

const ACCEPT_NEW = `
WITH inv AS (
  UPDATE app_invitations
     SET status = 'accepted', accepted_at = now()
   WHERE email = $2 AND status = 'pending'
  RETURNING id
)
INSERT INTO app_members (id, workos_user_id, email, name, role, status, invitation_id)
SELECT $1, $3, $2, $4, 'member', 'active', inv.id FROM inv
ON CONFLICT (workos_user_id) DO NOTHING
RETURNING id, email, name, role, status`;

const ACCEPT_RETURNING = `
WITH inv AS (
  UPDATE app_invitations
     SET status = 'accepted', accepted_at = now()
   WHERE email = $2 AND status = 'pending'
  RETURNING id
)
UPDATE app_members m
   SET status = 'active', revoked_at = NULL, invitation_id = inv.id, email = $2
  FROM inv
 WHERE m.workos_user_id = $1 AND m.status = 'revoked' AND m.role = 'member'
RETURNING m.id, m.email, m.name, m.role, m.status`;

/**
 * The access a signed-in person has right now. Accepts a pending invitation
 * for their verified address as a side effect, once.
 */
export const resolveAccess = async (
  sql: AppSql,
  identity: Identity
): Promise<Access> => {
  const email = normaliseEmail(identity.email);
  const [existing] = await sql(FIND, [identity.workosUserId]);
  if (existing !== undefined && text(existing, "status") === "active") {
    return { kind: "member", member: memberOf(existing) };
  }
  // An unverified address can't accept an invitation: anyone can type one.
  if (!identity.emailVerified) {
    return existing === undefined
      ? { kind: "not-invited" }
      : { kind: "revoked" };
  }
  if (existing === undefined) {
    const [created] = await sql(ACCEPT_NEW, [
      newId("mem"),
      email,
      identity.workosUserId,
      identity.name,
    ]);
    return created === undefined
      ? { kind: "not-invited" }
      : { kind: "member", member: memberOf(created) };
  }
  const [returned] = await sql(ACCEPT_RETURNING, [
    identity.workosUserId,
    email,
  ]);
  return returned === undefined
    ? { kind: "revoked" }
    : { kind: "member", member: memberOf(returned) };
};

export interface Person {
  readonly createdAt: Date;
  readonly email: string;
  readonly id: string;
  readonly name: string | null;
  readonly revokedAt: Date | null;
  readonly role: Role;
  readonly status: "active" | "revoked";
}

export interface PendingInvitation {
  readonly createdAt: Date;
  readonly email: string;
  readonly id: string;
}

const PEOPLE = `
SELECT id, email, name, role, status, created_at, revoked_at
  FROM app_members ORDER BY role DESC, created_at ASC`;

const PENDING = `
SELECT id, email, created_at FROM app_invitations
 WHERE status = 'pending' ORDER BY created_at DESC`;

export const listPeople = async (
  sql: AppSql
): Promise<{ people: Person[]; invitations: PendingInvitation[] }> => {
  const [people, invitations] = await Promise.all([
    sql(PEOPLE, []),
    sql(PENDING, []),
  ]);
  return {
    invitations: invitations.map((row) => ({
      createdAt: date(row, "created_at"),
      email: text(row, "email"),
      id: text(row, "id"),
    })),
    people: people.map((row) => ({
      createdAt: date(row, "created_at"),
      email: text(row, "email"),
      id: text(row, "id"),
      name: textOrNull(row, "name"),
      revokedAt: dateOrNull(row, "revoked_at"),
      role: roleOf(row),
      status: text(row, "status") === "active" ? "active" : "revoked",
    })),
  };
};

/** Thrown when someone other than the owner tries an owner action. Routes
 * check the role first; this is the second lock, in the data layer. */
export class OwnerOnlyError extends Error {
  constructor() {
    super("Only the owner can do this.");
    this.name = "OwnerOnlyError";
  }
}

const assertOwner = (actor: Member): void => {
  if (actor.role !== "owner") {
    throw new OwnerOnlyError();
  }
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const isEmailAddress = (value: string): boolean =>
  value.length <= 254 && EMAIL_PATTERN.test(value.trim());

const RECORD_INVITATION = `
INSERT INTO app_invitations (id, email, invited_by, status, workos_invitation_id)
SELECT $1, $2, $3, 'pending', $4
 WHERE NOT EXISTS (
   SELECT 1 FROM app_members WHERE email = $2 AND status = 'active'
 )
ON CONFLICT DO NOTHING
RETURNING id`;

export type InvitationResult =
  | { readonly kind: "invited"; readonly id: string }
  | { readonly kind: "already-member" }
  | { readonly kind: "already-invited" }
  | { readonly kind: "invalid-email" };

const ACTIVE_BY_EMAIL = `SELECT 1 FROM app_members WHERE email = $1 AND status = 'active'`;
const PENDING_BY_EMAIL = `SELECT 1 FROM app_invitations WHERE email = $1 AND status = 'pending'`;

/**
 * Record an invitation the owner is sending. `send` performs the WorkOS call
 * and returns its invitation id; it runs only after the local checks pass, so
 * a refused request sends no email.
 */
export const inviteByEmail = async (
  sql: AppSql,
  actor: Member,
  rawEmail: string,
  send: (email: string) => Promise<string>
): Promise<InvitationResult> => {
  assertOwner(actor);
  const email = normaliseEmail(rawEmail);
  if (!isEmailAddress(email)) {
    return { kind: "invalid-email" };
  }
  const active = await sql(ACTIVE_BY_EMAIL, [email]);
  if (active.length > 0) {
    return { kind: "already-member" };
  }
  const pending = await sql(PENDING_BY_EMAIL, [email]);
  if (pending.length > 0) {
    return { kind: "already-invited" };
  }
  const workosInvitationId = await send(email);
  const [row] = await sql(RECORD_INVITATION, [
    newId("inv"),
    email,
    actor.id,
    workosInvitationId,
  ]);
  return row === undefined
    ? { kind: "already-invited" }
    : { id: text(row, "id"), kind: "invited" };
};

const CANCEL_INVITATION = `
UPDATE app_invitations SET status = 'revoked', revoked_at = now()
 WHERE id = $1 AND status = 'pending'
RETURNING workos_invitation_id`;

/** Cancel a pending invitation. `revokeRemote` revokes it in WorkOS too. */
export const cancelInvitation = async (
  sql: AppSql,
  actor: Member,
  invitationId: string,
  revokeRemote: (workosInvitationId: string) => Promise<void>
): Promise<boolean> => {
  assertOwner(actor);
  const [row] = await sql(CANCEL_INVITATION, [invitationId]);
  if (row === undefined) {
    return false;
  }
  const remote = textOrNull(row, "workos_invitation_id");
  if (remote !== null) {
    await revokeRemote(remote);
  }
  return true;
};

const REVOKE_MEMBER = `
UPDATE app_members SET status = 'revoked', revoked_at = now()
 WHERE id = $1 AND status = 'active' AND role = 'member'
RETURNING id`;

/** Remove a member's access. The owner can't be removed this way, so the App
 * can never be left without one. Their Library stays, unreadable to anyone. */
export const revokeMember = async (
  sql: AppSql,
  actor: Member,
  memberId: string
): Promise<boolean> => {
  assertOwner(actor);
  const rows = await sql(REVOKE_MEMBER, [memberId]);
  return rows.length > 0;
};
