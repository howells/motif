import { endRun, getOwnedRun } from "@/lib/app/boards/run-store";
import { runView } from "@/lib/app/boards/views";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";

/** Stop a run between steps. A call already with fal finishes and is
 * counted; nothing after it starts. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/app/board-runs/[id]/stop">
) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "brun")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  await endRun(auth.sql, auth.member.id, id, "stopped");
  const run = await getOwnedRun(auth.sql, auth.member.id, id);
  if (run === null) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  return Response.json({ run: runView(run) });
}
