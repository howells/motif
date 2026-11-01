import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";
import { getLibraryItem } from "@/lib/app/library/item";

export const dynamic = "force-dynamic";

/** One of the person's images, opened: what made it, where, and from what. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/app/library/[id]">
) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "gen")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const item = await getLibraryItem(auth.sql, auth.member.id, id);
  return item === null
    ? appError(404, "NOT_FOUND", "Not found.")
    : Response.json({ item });
}
