import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";
import { getOwnedComparison } from "@/lib/app/library/queries";
import { scheduleGenerations } from "@/lib/app/tasks/schedule";
import { generationView } from "@/lib/app/views";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const IN_FLIGHT = new Set(["reserved", "submitting", "submitted"]);

export async function GET(
  request: Request,
  context: RouteContext<"/api/app/comparisons/[id]">
) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "cmp")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const comparison = await getOwnedComparison(auth.sql, auth.member.id, id);
  if (comparison === null) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const stalled = comparison.generations.flatMap((generation) =>
    IN_FLIGHT.has(generation.status) &&
    (generation.leaseUntil === null ||
      generation.leaseUntil.getTime() < Date.now())
      ? [generation.id]
      : []
  );
  if (stalled.length > 0) {
    scheduleGenerations(auth.sql, auth.member.id, stalled);
  }
  return Response.json({
    comparison: {
      createdAt: comparison.createdAt.toISOString(),
      generations: comparison.generations.map((generation) =>
        generationView(generation)
      ),
      id: comparison.id,
      models: comparison.models,
      prompt: comparison.prompt,
    },
  });
}
