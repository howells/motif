import { respond } from "@/lib/app/boards/http";
import { disconnect } from "@/lib/app/boards/service";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/app/wires/[id]/remove">
) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "wir")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  return respond(await disconnect(auth.sql, auth.member.id, id));
}
