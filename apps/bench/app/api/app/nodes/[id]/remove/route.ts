import { respond } from "@/lib/app/boards/http";
import { removeBoardNode } from "@/lib/app/boards/service";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";

/** Take a node off its Board. Its images stay in the Library. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/app/nodes/[id]/remove">
) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "nod")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  return respond(await removeBoardNode(auth.sql, auth.member.id, id));
}
