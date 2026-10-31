import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";
import { scheduleGenerations } from "@/lib/app/tasks/schedule";
import { getOwnedGeneration } from "@/lib/app/tasks/store";
import { generationView } from "@/lib/app/views";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const IN_FLIGHT = new Set(["reserved", "submitting", "submitted"]);

/** One of the person's Generations. A poll that finds it unfinished with no
 * live worker starts one, so a run carries on after a dropped connection or a
 * stopped function. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/app/generations/[id]">
) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "gen")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const generation = await getOwnedGeneration(auth.sql, auth.member.id, id);
  if (generation === null) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const stalled =
    IN_FLIGHT.has(generation.status) &&
    (generation.leaseUntil === null ||
      generation.leaseUntil.getTime() < Date.now());
  if (stalled) {
    scheduleGenerations(auth.sql, auth.member.id, [generation.id]);
  }
  return Response.json({ generation: generationView(generation) });
}
