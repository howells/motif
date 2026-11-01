import { authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";
import { countImages, listStacks } from "@/lib/app/library/queries";
import { stackView } from "@/lib/app/views";
import { isAppTaskId } from "@/lib/site/commands";

export const dynamic = "force-dynamic";

/** The person's stacks, latest first: optionally only one Board's, one
 * Task's, or those whose prompt matches. */
export async function GET(request: Request) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const params = new URL(request.url).searchParams;
  const board = params.get("board") ?? "";
  const task = params.get("task") ?? "";
  const [stacks, images] = await Promise.all([
    listStacks(auth.sql, auth.member.id, {
      comparisonsOnly: params.get("filter") === "comparisons",
      search: params.get("q")?.slice(0, 200),
      ...(isAppId(board, "brd") && { boardId: board }),
      ...(isAppTaskId(task) && { task }),
    }),
    countImages(auth.sql, auth.member.id),
  ]);
  return Response.json({
    images,
    stacks: stacks.map((stack) => stackView(stack)),
  });
}
