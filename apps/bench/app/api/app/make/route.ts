import { z } from "zod";

import { parseBody } from "@/lib/app/boards/http";
import { make } from "@/lib/app/boards/make";
import { MakeSchema } from "@/lib/app/boards/make-schema";
import { scheduleBoardRun } from "@/lib/app/boards/schedule";
import { runView } from "@/lib/app/boards/views";
import { getCapabilities } from "@/lib/app/db";
import { appError, authorise } from "@/lib/app/http/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MakeRequest = MakeSchema.extend({
  approvedMicros: z.int().positive(),
  idempotencyKey: z.uuid(),
});

/** Make on the phone: added to the Inbox and run at the price shown. */
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
  const body = await parseBody(request, MakeRequest);
  if (!body.ok) {
    return body.response;
  }
  const made = await make(auth.sql, auth.member, body.value);
  if (!made.ok) {
    return appError(made.status, made.code, made.message, made.details);
  }
  scheduleBoardRun(auth.sql, auth.member, made.value.run.id);
  return Response.json(
    { duplicate: made.value.duplicate, run: runView(made.value.run) },
    { status: made.value.duplicate ? 200 : 202 }
  );
}
