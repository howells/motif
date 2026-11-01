import { z } from "zod";

import { parseBody, respond } from "@/lib/app/boards/http";
import { quoteBoardRun } from "@/lib/app/boards/service";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";

const QuoteRequest = z.strictObject({
  fromNodeId: z.string().regex(/^nod_[0-9a-f]{32}$/u),
  scope: z.enum(["node", "downstream"]),
});

/** Price one node, or a node and everything below it. Spends nothing. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/app/boards/[id]/quote">
) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "brd")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const body = await parseBody(request, QuoteRequest);
  if (!body.ok) {
    return body.response;
  }
  return respond(
    await quoteBoardRun(
      auth.sql,
      auth.member.id,
      id,
      body.value.fromNodeId,
      body.value.scope
    )
  );
}
