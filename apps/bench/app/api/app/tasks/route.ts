import { getCapabilities } from "@/lib/app/db";
import { appError, authorise, readJson } from "@/lib/app/http/guard";
import { parseTaskRequest } from "@/lib/app/tasks/request";
import { scheduleGenerations } from "@/lib/app/tasks/schedule";
import { startRun } from "@/lib/app/tasks/start";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Run one Task: reserve its ceiling against the shared cap, record the
 * Generation, and start the worker after responding. */
export async function POST(request: Request) {
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
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return appError(400, "INVALID_JSON", "Send the request as JSON.");
  }
  const parsed = parseTaskRequest(body);
  if (!parsed.ok) {
    return appError(400, "UNSUPPORTED_REQUEST", parsed.message);
  }
  const started = await startRun(auth.sql, auth.member, parsed.request);
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
    {
      duplicate: started.kind === "duplicate",
      generationId: started.generationIds[0],
    },
    { status: started.kind === "duplicate" ? 200 : 202 }
  );
}
