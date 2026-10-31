import type { AppRow } from "@motif/bench-db/app-sql";
import { describe, expect, it, vi } from "vitest";

import {
  OwnerOnlyError,
  cancelInvitation,
  inviteByEmail,
  resolveAccess,
  revokeMember,
} from "./members";
import type { Member } from "./members";

/** A database double: answers each statement by its first matching fragment. */
const fakeSql = (answers: [fragment: string, rows: AppRow[]][]) =>
  vi.fn(async (text: string, _values: readonly unknown[]) => {
    const found = answers.find(([fragment]) => text.includes(fragment));
    return found?.[1] ?? [];
  });

const OWNER: Member = {
  email: "owner@example.test",
  id: `mem_${"0".repeat(32)}`,
  name: null,
  role: "owner",
};
const MEMBER: Member = {
  ...OWNER,
  id: `mem_${"1".repeat(32)}`,
  role: "member",
};
const ROW = {
  email: "a@example.test",
  id: MEMBER.id,
  name: null,
  role: "member",
  status: "active",
};
const IDENTITY = {
  email: " A@Example.test ",
  emailVerified: true,
  name: null,
  workosUserId: "user_1",
};

describe("resolveAccess", () => {
  it("lets an active member straight in", async () => {
    const sql = fakeSql([["FROM app_members WHERE workos_user_id", [ROW]]]);
    await expect(resolveAccess(sql, IDENTITY)).resolves.toMatchObject({
      kind: "member",
    });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("refuses a revoked member at once", async () => {
    const sql = fakeSql([
      [
        "FROM app_members WHERE workos_user_id",
        [{ ...ROW, status: "revoked" }],
      ],
    ]);
    await expect(resolveAccess(sql, IDENTITY)).resolves.toStrictEqual({
      kind: "revoked",
    });
  });

  it("never accepts an invitation for an unverified address", async () => {
    const sql = fakeSql([]);
    await expect(
      resolveAccess(sql, { ...IDENTITY, emailVerified: false })
    ).resolves.toStrictEqual({
      kind: "not-invited",
    });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("joins a new person only through a pending invitation, never as owner", async () => {
    const sql = fakeSql([["INSERT INTO app_members", [ROW]]]);
    await expect(resolveAccess(sql, IDENTITY)).resolves.toMatchObject({
      kind: "member",
      member: { role: "member" },
    });
    const insert = sql.mock.calls.find(([text]) =>
      text.includes("INSERT INTO app_members")
    );
    expect(insert?.[0]).toContain("'member', 'active'");
    expect(insert?.[0]).toContain("status = 'pending'");
    expect(insert?.[1]).toContain("a@example.test");
  });

  it("keeps out a first sign-in with no invitation", async () => {
    await expect(resolveAccess(fakeSql([]), IDENTITY)).resolves.toStrictEqual({
      kind: "not-invited",
    });
  });
});

describe("owner-only changes", () => {
  it("refuses a member who tries to invite, cancel or revoke, before touching anything", async () => {
    const sql = fakeSql([]);
    const send = vi.fn(async () => "inv_remote");
    await expect(
      inviteByEmail(sql, MEMBER, "b@example.test", send)
    ).rejects.toBeInstanceOf(OwnerOnlyError);
    await expect(
      cancelInvitation(sql, MEMBER, "inv_x", async () => {})
    ).rejects.toBeInstanceOf(OwnerOnlyError);
    await expect(revokeMember(sql, MEMBER, OWNER.id)).rejects.toBeInstanceOf(
      OwnerOnlyError
    );
    expect(sql).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends no invitation to someone already in or already invited", async () => {
    const send = vi.fn(async () => "inv_remote");
    await expect(
      inviteByEmail(
        fakeSql([["FROM app_members WHERE email", [{ x: 1 }]]]),
        OWNER,
        "b@example.test",
        send
      )
    ).resolves.toStrictEqual({ kind: "already-member" });
    await expect(
      inviteByEmail(
        fakeSql([["FROM app_invitations WHERE email", [{ x: 1 }]]]),
        OWNER,
        "b@example.test",
        send
      )
    ).resolves.toStrictEqual({ kind: "already-invited" });
    await expect(
      inviteByEmail(fakeSql([]), OWNER, "not-an-address", send)
    ).resolves.toStrictEqual({
      kind: "invalid-email",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("can't remove the owner", async () => {
    const sql = fakeSql([]);
    await expect(revokeMember(sql, OWNER, OWNER.id)).resolves.toBe(false);
    expect(sql.mock.calls[0]?.[0]).toContain("role = 'member'");
  });
});
