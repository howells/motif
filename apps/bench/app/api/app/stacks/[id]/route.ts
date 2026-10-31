import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";
import { listStack } from "@/lib/app/library/queries";
import { generationView } from "@/lib/app/views";

export const dynamic = "force-dynamic";

/** Every version in one of the person's stacks, latest first. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/app/stacks/[id]">
) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "gen")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const generations = await listStack(auth.sql, auth.member.id, id);
  if (generations.length === 0) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  return Response.json({
    generations: generations.map((generation) => generationView(generation)),
  });
}
