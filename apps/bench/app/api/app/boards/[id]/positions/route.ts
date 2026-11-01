import { z } from "zod";

import { parseBody } from "@/lib/app/boards/http";
import { getOwnedBoard, moveNodes } from "@/lib/app/boards/store";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";

const coordinate = z.number().min(-100_000).max(100_000);
const Moves = z.strictObject({
  moves: z
    .array(
      z.strictObject({
        id: z.string().regex(/^nod_[0-9a-f]{32}$/u),
        x: coordinate,
        y: coordinate,
      })
    )
    .min(1)
    .max(200),
});

/** Where nodes sit on the canvas. Moving never makes anything Stale. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/app/boards/[id]/positions">
) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "brd")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const body = await parseBody(request, Moves);
  if (!body.ok) {
    return body.response;
  }
  const board = await getOwnedBoard(auth.sql, auth.member.id, id);
  if (board === null) {
    return appError(404, "NOT_FOUND", "That isn't one of your Boards.");
  }
  await moveNodes(auth.sql, auth.member.id, body.value.moves);
  return new Response(null, { status: 204 });
}
