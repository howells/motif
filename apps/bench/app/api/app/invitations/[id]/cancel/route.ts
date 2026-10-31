import { cancelInvitation } from "@/lib/app/auth/members";
import { revokeWorkosInvitation } from "@/lib/app/auth/workos-admin";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";

/** Cancel a pending invitation, here and in WorkOS. Owner only. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/app/invitations/[id]/cancel">
) {
  const auth = await authorise(request, { owner: true, write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (
    !isAppId(id, "inv") ||
    !(await cancelInvitation(auth.sql, auth.member, id, revokeWorkosInvitation))
  ) {
    return appError(
      404,
      "NOT_FOUND",
      "There's no pending invitation to cancel."
    );
  }
  return Response.json({ cancelled: true });
}
