import { jsonError, jsonOk, jsonValidationError } from "@/lib/api-response";
/**
 * Re-runs the failed part of a finished run. A 24-model sweep that loses
 * three samples to provider rate limiting is not a run worth paying for
 * twice — this re-dispatches only the failures.
 *
 * Deliberately *not* modelled as "started: true" like `POST /judge` was.
 * That endpoint reported success while doing nothing, twice, for two
 * different reasons (`docs/arc/handoff.md`, trap 3: "a 200 response does not
 * mean the work happened"). This one answers with the count it actually
 * dispatched and, when it dispatched none, the reason from `retry.ts`'s
 * closed refusal set — so a caller can always tell "retried 3" from
 * "retried 0 because the cap is spent" without reading telemetry.
 *
 * A refusal is a 409, not a 400: the request was well-formed and the run
 * exists; it is the run's current state that makes the retry impossible.
 */
import { retrySamples } from "@/lib/runs/repository";
import { RETRY_REFUSAL_MESSAGE } from "@/lib/runs/retry";
import { RetryRunInputSchema } from "@/lib/runs/validation";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown = {};
  const rawText = await request.text();
  if (rawText.length > 0) {
    try {
      body = JSON.parse(rawText);
    } catch {
      return jsonError(400, "INVALID_JSON", "Request body must be JSON.");
    }
  }

  const parsed = RetryRunInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonValidationError(parsed.error);
  }

  const result = await retrySamples(id, parsed.data.sampleIds);
  if (result === null) {
    return jsonError(404, "RUN_NOT_FOUND", `No run with id "${id}".`);
  }
  if (result.refusal !== null) {
    return jsonError(
      409,
      result.refusal,
      RETRY_REFUSAL_MESSAGE[result.refusal]
    );
  }
  return jsonOk({ retried: result.retried });
}
