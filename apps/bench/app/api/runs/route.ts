import { jsonError, jsonOk, jsonValidationError } from "@/lib/api-response";
/**
 * `GET` — run history for `/`. `POST` — creates and starts a run, returning
 * its id immediately (`startAsync` shape, `docs/arc/bench/BRIEF.md`: "No
 * SSE... the run is started ... and the results page polls"). `force-dynamic`:
 * this is the DB-backed (in this phase, mock-store-backed) list/create
 * endpoint and must never be statically cached.
 */
import {
  CostCapExceededError,
  createRun,
  listRuns,
  MissingPricingError,
} from "@/lib/runs/repository";
import { RunSpecInputSchema } from "@/lib/runs/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return jsonOk({ runs: await listRuns() });
}

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

  try {
    const { runId } = await createRun(parsed.data);
    return jsonOk({ runId }, { status: 201 });
  } catch (error) {
    if (error instanceof CostCapExceededError) {
      return jsonError(
        400,
        "COST_CAP_EXCEEDED",
        `Projected cost exceeds the ~$${parsed.data.maxEstimatedCostUsd.toFixed(2)} cap you confirmed.`
      );
    }
    if (error instanceof MissingPricingError) {
      return jsonError(400, "UNKNOWN_MODEL", error.message);
    }
    throw error;
  }
}
