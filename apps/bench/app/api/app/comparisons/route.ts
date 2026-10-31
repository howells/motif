import { z } from "zod";

import { MAX_COMPARISON_MODELS } from "@/lib/app/budget/policy";
import { getCapabilities } from "@/lib/app/db";
import { appError, authorise, readJson } from "@/lib/app/http/guard";
import { APP_ASPECTS } from "@/lib/app/tasks/request";
import { scheduleGenerations } from "@/lib/app/tasks/schedule";
import { startComparison } from "@/lib/app/tasks/start";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.strictObject({
  aspect: z.enum(APP_ASPECTS).optional(),
  idempotencyKey: z.uuid(),
  models: z
    .array(z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/u))
    .min(2)
    .max(MAX_COMPARISON_MODELS),
  prompt: z.string().trim().min(1).max(4000),
});

/** Send one prompt to several Models. Every hold is reserved before any
 * Model starts; the results land in the person's own Library. */
export async function POST(request: Request) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const capabilities = getCapabilities();
  if (!capabilities.provider || !capabilities.storage) {
    return appError(
      503,
      "PROVIDER_UNAVAILABLE",
      "Running Models isn't set up on this server."
    );
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
      parsed.error.issues[0]?.message ?? "That Comparison isn't valid."
    );
  }
  const started = await startComparison(auth.sql, auth.member, parsed.data);
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
      comparisonId:
        started.kind === "started" ? (started.comparisonId ?? null) : null,
      generationIds: started.generationIds,
    },
    { status: 202 }
  );
}
