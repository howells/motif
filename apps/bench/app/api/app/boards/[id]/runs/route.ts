import { z } from "zod";

import { parseBody } from "@/lib/app/boards/http";
import { scheduleBoardRun } from "@/lib/app/boards/schedule";
import { startBoardRun } from "@/lib/app/boards/service";
import { runView } from "@/lib/app/boards/views";
import { getCapabilities } from "@/lib/app/db";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RunRequest = z.strictObject({
  approvedConfiguration: z.string().regex(/^[0-9a-f]{64}$/u),
  approvedMicros: z.int().positive(),
  fromNodeId: z.string().regex(/^nod_[0-9a-f]{32}$/u),
  idempotencyKey: z.uuid(),
  scope: z.enum(["node", "downstream"]),
});

/** Run what the person approved: priced again, recorded, then driven as one
 * workflow after the response. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/app/boards/[id]/runs">
) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const capabilities = getCapabilities();
  if (!capabilities.provider) {
    return appError(
      503,
      "PROVIDER_UNAVAILABLE",
      "The fal key isn't set up on this server, so nothing can run."
    );
  }
  if (!capabilities.storage) {
    return appError(
      503,
      "STORAGE_UNAVAILABLE",
      "Private storage isn't set up on this server, so results can't be kept."
    );
  }
  const { id } = await context.params;
  if (!isAppId(id, "brd")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const body = await parseBody(request, RunRequest);
  if (!body.ok) {
    return body.response;
  }
  const started = await startBoardRun(auth.sql, auth.member, {
    ...body.value,
    boardId: id,
  });
  if (!started.ok) {
    return appError(
      started.status,
      started.code,
      started.message,
      started.details
    );
  }
  scheduleBoardRun(auth.sql, auth.member, started.value.run.id);
  return Response.json(
    { duplicate: started.value.duplicate, run: runView(started.value.run) },
    { status: started.value.duplicate ? 200 : 202 }
  );
}
