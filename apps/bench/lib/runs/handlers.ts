/**
 * The retired Bench run API's handlers, kept as functions so their dispatch
 * and retry behaviour stays under test. No route calls the spending ones:
 * `POST /api/runs` and `POST /api/runs/[id]/retry` answer 410 and point to
 * Compare in the App, which holds every run against the shared monthly cap.
 * The read handlers serve the owner only.
 */
import { jsonError, jsonOk, jsonValidationError } from "@/lib/api-response";
import { HostedRunTooLongError } from "@/lib/runs/execution-budget";
import {
  CostCapExceededError,
  createRun,
  getRun,
  listRuns,
  MissingPricingError,
  retrySamples,
} from "@/lib/runs/repository";
import { RETRY_REFUSAL_MESSAGE } from "@/lib/runs/retry";
import { RetryRunInputSchema, RunSpecInputSchema } from "@/lib/runs/validation";

export const listRunsResponse = async (): Promise<Response> =>
  jsonOk({ runs: await listRuns() });

export const createRunResponse = async (
  request: Request
): Promise<Response> => {
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
    if (error instanceof HostedRunTooLongError) {
      return jsonError(422, "HOSTED_RUN_TOO_LONG", error.message);
    }
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
};

export const retryRunResponse = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> => {
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

  let result;
  try {
    result = await retrySamples(id, parsed.data.sampleIds);
  } catch (error) {
    if (error instanceof HostedRunTooLongError) {
      return jsonError(409, "HOSTED_RUN_TOO_LONG", error.message);
    }
    throw error;
  }
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
};

export const runDetailResponse = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> => {
  const { id } = await params;
  const detail = await getRun(id);
  if (!detail) {
    return jsonError(404, "RUN_NOT_FOUND", `No run with id "${id}".`);
  }
  return jsonOk(detail);
};
