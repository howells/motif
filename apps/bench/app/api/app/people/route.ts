import { z } from "zod";

import { inviteByEmail, listPeople } from "@/lib/app/auth/members";
import { sendWorkosInvitation } from "@/lib/app/auth/workos-admin";
import { appError, authorise, readJson } from "@/lib/app/http/guard";

export const dynamic = "force-dynamic";

/** Everyone with access, and pending invitations. Owner only. */
export async function GET(request: Request) {
  const auth = await authorise(request, { owner: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { invitations, people } = await listPeople(auth.sql);
  return Response.json({
    invitations: invitations.map((invitation) => ({
      ...invitation,
      createdAt: invitation.createdAt.toISOString(),
    })),
    people: people.map((person) => ({
      ...person,
      createdAt: person.createdAt.toISOString(),
      revokedAt: person.revokedAt?.toISOString() ?? null,
    })),
  });
}

const Invite = z.strictObject({ email: z.string().trim().min(3).max(254) });

/** Invite someone by email, through WorkOS. Owner only. */
export async function POST(request: Request) {
  const auth = await authorise(request, { owner: true, write: true });
  if (!auth.ok) {
    return auth.response;
  }
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return appError(400, "INVALID_JSON", "Send the request as JSON.");
  }
  const parsed = Invite.safeParse(body);
  if (!parsed.success) {
    return appError(400, "INVALID_EMAIL", "Enter an email address.");
  }
  const result = await inviteByEmail(
    auth.sql,
    auth.member,
    parsed.data.email,
    sendWorkosInvitation
  );
  switch (result.kind) {
    case "invited": {
      return Response.json({ invitationId: result.id }, { status: 201 });
    }
    case "already-member": {
      return appError(409, "ALREADY_MEMBER", "That person already has access.");
    }
    case "already-invited": {
      return appError(
        409,
        "ALREADY_INVITED",
        "That address already has an invitation waiting."
      );
    }
    case "invalid-email": {
      return appError(400, "INVALID_EMAIL", "That isn't an email address.");
    }
    default: {
      throw new TypeError("Unknown invitation result.");
    }
  }
}
