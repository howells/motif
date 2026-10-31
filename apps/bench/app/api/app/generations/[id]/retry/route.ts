import { z } from "zod";

import { appError, authorise, readJson } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";
import { scheduleGenerations } from "@/lib/app/tasks/schedule";
import { retryRun } from "@/lib/app/tasks/start";
import { getOwnedGeneration } from "@/lib/app/tasks/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.strictObject({ idempotencyKey: z.uuid() });

/** Try a failed run again: a new run with its own reservation. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/app/generations/[id]/retry">
) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "gen")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return appError(400, "INVALID_JSON", "Send the request as JSON.");
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return appError(
      400,
      "UNSUPPORTED_REQUEST",
      "A retry needs a fresh idempotency key."
    );
  }
  const failed = await getOwnedGeneration(auth.sql, auth.member.id, id);
  if (failed === null) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const started = await retryRun(
    auth.sql,
    auth.member,
    failed,
    parsed.data.idempotencyKey
  );
  if (started.kind === "refused") {
    return appError(
      started.status,
      started.code,
      started.message,
      started.details
    );
  }
  scheduleGenerations(auth.sql, auth.member.id, started.generationIds);
  return Response.json(
    { generationId: started.generationIds[0] },
    { status: 202 }
  );
}
