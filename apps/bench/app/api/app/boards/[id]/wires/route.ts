import { z } from "zod";

import { parseBody, respond } from "@/lib/app/boards/http";
import { connect } from "@/lib/app/boards/service";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";

const nodeId = z.string().regex(/^nod_[0-9a-f]{32}$/u);
const NewWire = z.strictObject({ from: nodeId, to: nodeId });

/** Wire one node into another. A node has one input, so this replaces
 * whatever fed it; what it feeds goes Stale. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/app/boards/[id]/wires">
) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "brd")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const body = await parseBody(request, NewWire);
  if (!body.ok) {
    return body.response;
  }
  return respond(
    await connect(auth.sql, auth.member.id, id, body.value.from, body.value.to),
    201
  );
}
