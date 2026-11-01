import { z } from "zod";

import { parseBody, respond } from "@/lib/app/boards/http";
import { boardViewById } from "@/lib/app/boards/service";
import { renameBoard } from "@/lib/app/boards/store";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: RouteContext<"/api/app/boards/[id]">
) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "brd")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  return respond(await boardViewById(auth.sql, auth.member.id, id));
}

const Rename = z.strictObject({
  name: z.string().trim().min(1, "Name the Board.").max(80),
});

/** Rename a Board. The Inbox keeps its name. */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/app/boards/[id]">
) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "brd")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const body = await parseBody(request, Rename);
  if (!body.ok) {
    return body.response;
  }
  const board = await renameBoard(
    auth.sql,
    auth.member.id,
    id,
    body.value.name
  );
  if (board === null) {
    return appError(404, "NOT_FOUND", "That Board can't be renamed.");
  }
  return respond(await boardViewById(auth.sql, auth.member.id, id));
}
