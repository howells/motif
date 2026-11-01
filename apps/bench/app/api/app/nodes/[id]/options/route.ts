import { respond } from "@/lib/app/boards/http";
import { nodeOptions } from "@/lib/app/boards/service";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";

/** The Models a node could use, priced on its real inputs. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/app/nodes/[id]/options">
) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "nod")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  return respond(await nodeOptions(auth.sql, auth.member.id, id));
}
