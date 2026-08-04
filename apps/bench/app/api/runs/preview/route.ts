import { jsonError, jsonOk, jsonValidationError } from "@/lib/api-response";
/**
 * Dry-run preview — the composer's "Preview" step. Pure alignment against
 * `@motif/bench-core`, zero fal calls, zero persistence
 * (`docs/arc/bench/BRIEF.md`, UI section). `force-dynamic` because request
 * bodies vary per call; there is nothing here Next could statically render.
 */
import { previewRun } from "@/lib/runs/repository";
import { RunSpecInputSchema } from "@/lib/runs/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Request body must be JSON.");
  }

  const parsed = RunSpecInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonValidationError(parsed.error);
  }

  const preview = previewRun(parsed.data);
  return jsonOk(preview);
}
