import { revokeMember } from "@/lib/app/auth/members";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";

/** Remove a member's access. Takes effect on their next request. Owner only. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/app/people/[id]/revoke">
) {
  const auth = await authorise(request, { owner: true, write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "mem") || !(await revokeMember(auth.sql, auth.member, id))) {
    return appError(
      404,
      "NOT_FOUND",
      "There's no member with access to remove."
    );
  }
  return Response.json({ revoked: true });
}
