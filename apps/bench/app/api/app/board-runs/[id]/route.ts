import { getOwnedRun, listRunResults } from "@/lib/app/boards/run-store";
import { scheduleBoardRun } from "@/lib/app/boards/schedule";
import { resultView, runView } from "@/lib/app/boards/views";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";
import { getOwnedGenerations } from "@/lib/app/tasks/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** One of the member's runs. A poll that finds it running with no live
 * worker takes it over, so a run carries on after a function stopped. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/app/board-runs/[id]">
) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "brun")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const run = await getOwnedRun(auth.sql, auth.member.id, id);
  if (run === null) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const stalled =
    run.status === "running" &&
    (run.leaseUntil === null || run.leaseUntil.getTime() < Date.now());
  if (stalled) {
    scheduleBoardRun(auth.sql, auth.member, run.id);
  }
  const made = await listRunResults(auth.sql, auth.member.id, run.id);
  const generations = await getOwnedGenerations(
    auth.sql,
    auth.member.id,
    made.map((result) => result.generationId)
  );
  return Response.json({
    results: generations.map((generation) => resultView(generation, run.id)),
    run: runView(run),
  });
}
