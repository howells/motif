import { resendWorkosInvitation } from "@/lib/app/auth/workos-admin";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";
import { textOrNull } from "@/lib/app/rows";

export const dynamic = "force-dynamic";

const PENDING = `SELECT workos_invitation_id FROM app_invitations WHERE id = $1 AND status = 'pending'`;

/** Send a pending invitation's email again. Owner only. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/app/invitations/[id]/resend">
) {
  const auth = await authorise(request, { owner: true, write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  const [row] = isAppId(id, "inv") ? await auth.sql(PENDING, [id]) : [];
  const remote =
    row === undefined ? null : textOrNull(row, "workos_invitation_id");
  if (remote === null) {
    return appError(
      404,
      "NOT_FOUND",
      "There's no pending invitation to resend."
    );
  }
  await resendWorkosInvitation(remote);
  return Response.json({ resent: true });
}
