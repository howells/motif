/**
 * Tool execution bodies for `FalClient`, both synchronous and queued.
 *
 * These live outside `server.ts` only because that file sits on the 600-line
 * `max-lines` ceiling and the queued tool path did not fit. The public API is
 * unchanged: every function here is called by a thin `FalClient` method of the
 * same shape, and callers should keep using the client. Please don't merge this
 * back into `server.ts` — it will breach the ceiling again.
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { MotifError } from "./errors";
import {
  asString,
  endpointFromQueueUrl,
  isRecord,
  parseQueueSubmission,
} from "./fal-parse";
import { buildFalToolRequest } from "./tools";
import type { FalToolRequest } from "./tools";
import type {
  JobStatus,
  QueuedToolJob,
  ToolResponse,
  ToolRunOptions,
} from "./types";

const FAL_BASE_URL = "https://fal.run";
const FAL_QUEUE_URL = "https://queue.fal.run";

/** Poll cadence for queued tool runs, matching the queued generation path. */
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 160;

/**
 * The slice of `FalClient` these functions need.
 *
 * `request` is the client's authenticated, retrying fetch; `getJobStatus` is
 * its queue status parser, reused so queued tools and queued generations read
 * fal's status vocabulary identically.
 */
export interface FalRequestExecutor {
  getJobStatus: (
    endpoint: string,
    requestId: string
  ) => Promise<Result<JobStatus, MotifError>>;
  request: (
    url: string,
    init?: RequestInit
  ) => Promise<Result<Response, MotifError>>;
}

/** Each client's request executor, reachable by the Task client only. */
const EXECUTORS = new WeakMap<object, FalRequestExecutor>();

/** Record the request seam of a `FalClient`. Internal. */
export function registerRequestExecutor(
  client: object,
  executor: FalRequestExecutor
): void {
  EXECUTORS.set(client, executor);
}

/** The authenticated, retrying request seam of a `FalClient`. Internal. */
export function falRequestExecutor(client: object): FalRequestExecutor {
  const executor = EXECUTORS.get(client);
  if (executor === undefined) {
    throw new MotifError("FalClient executor is not registered", 0);
  }
  return executor;
}

/** Build a tool request, converting a validation throw into a `Result`. */
function buildToolRequest(
  options: ToolRunOptions
): Result<FalToolRequest, MotifError> {
  try {
    return ok(buildFalToolRequest(options));
  } catch (error) {
    return err(
      new MotifError(error instanceof Error ? error.message : String(error), 0)
    );
  }
}

/** A request ready to send: endpoint, body and any extra headers. */
export interface PreparedFalRequest {
  body: Record<string, unknown>;
  endpoint: string;
  headers?: Record<string, string>;
}

/** A finished fal response and the request id it carried. */
export interface FalRequestResult {
  data: Record<string, unknown>;
  requestId?: string;
}

function requestInit(prepared: PreparedFalRequest): RequestInit {
  return {
    body: JSON.stringify(prepared.body),
    headers: prepared.headers ?? {},
    method: "POST",
  };
}

/** POST a prepared request to fal's synchronous endpoint. */
export async function runRequest(
  exec: FalRequestExecutor,
  prepared: PreparedFalRequest
): Promise<Result<FalRequestResult, MotifError>> {
  const response = await exec.request(
    `${FAL_BASE_URL}/${prepared.endpoint}`,
    requestInit(prepared)
  );
  if (response.isErr()) {
    return err(response.error);
  }

  const data: unknown = await response.value.json();
  const record = isRecord(data) ? data : {};
  const requestId =
    response.value.headers.get("x-fal-request-id") ??
    asString(record.request_id);
  return ok({ data: record, requestId: requestId ?? undefined });
}

/** Submit a prepared request to the fal queue. */
export async function submitRequest(
  exec: FalRequestExecutor,
  prepared: PreparedFalRequest
): Promise<Result<QueuedToolJob, MotifError>> {
  const response = await exec.request(
    `${FAL_QUEUE_URL}/${prepared.endpoint}`,
    requestInit(prepared)
  );
  if (response.isErr()) {
    return err(response.error);
  }

  const data: unknown = await response.value.json();
  const submission = parseQueueSubmission(data);

  return ok({
    endpoint: endpointFromQueueUrl(submission.responseUrl, prepared.endpoint),
    requestId: submission.requestId,
  });
}

/** Poll one queued run. */
export async function checkToolStatus(
  exec: FalRequestExecutor,
  job: QueuedToolJob
): Promise<Result<JobStatus, MotifError>> {
  return await exec.getJobStatus(job.endpoint, job.requestId);
}

/** Fetch the finished payload for a queued run. */
export async function getToolResult(
  exec: FalRequestExecutor,
  job: QueuedToolJob
): Promise<Result<ToolResponse, MotifError>> {
  const url = `${FAL_QUEUE_URL}/${job.endpoint}/requests/${job.requestId}`;
  const response = await exec.request(url);
  if (response.isErr()) {
    return err(response.error);
  }

  const data: unknown = await response.value.json();
  return ok(isRecord(data) ? data : {});
}

/** Submit a prepared request, poll it to completion and fetch the result. */
export async function runRequestQueued(
  exec: FalRequestExecutor,
  prepared: PreparedFalRequest,
  onProgress?: (status: string, queuePosition?: number) => void
): Promise<Result<FalRequestResult, MotifError>> {
  const job = await submitRequest(exec, prepared);
  if (job.isErr()) {
    return err(job.error);
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const status = await checkToolStatus(exec, job.value);
    if (status.isErr()) {
      return err(status.error);
    }

    onProgress?.(status.value.status, status.value.queuePosition);

    if (status.value.status === "completed") {
      const result = await getToolResult(exec, job.value);
      return result.map((data) => ({ data, requestId: job.value.requestId }));
    }

    if (status.value.status === "failed") {
      const message = status.value.error ?? "Queued run failed";
      return err(new MotifError(message, 0, undefined, job.value.requestId));
    }

    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }

  return err(
    new MotifError("Queued run timed out", 0, undefined, job.value.requestId)
  );
}

/** Body of `FalClient.runTool`. */
export async function runTool(
  exec: FalRequestExecutor,
  options: ToolRunOptions
): Promise<Result<ToolResponse, MotifError>> {
  const request = buildToolRequest(options);
  if (request.isErr()) {
    return err(request.error);
  }
  const result = await runRequest(exec, request.value);
  return result.map(({ data }) => data);
}

/** Body of `FalClient.submitTool`. */
export async function submitTool(
  exec: FalRequestExecutor,
  options: ToolRunOptions
): Promise<Result<QueuedToolJob, MotifError>> {
  const request = buildToolRequest(options);
  if (request.isErr()) {
    return err(request.error);
  }
  return await submitRequest(exec, request.value);
}

/** Body of `FalClient.runToolQueued`. */
export async function runToolQueued(
  exec: FalRequestExecutor,
  options: ToolRunOptions,
  onProgress?: (status: string, queuePosition?: number) => void
): Promise<Result<ToolResponse, MotifError>> {
  const request = buildToolRequest(options);
  if (request.isErr()) {
    return err(request.error);
  }
  const result = await runRequestQueued(exec, request.value, onProgress);
  return result.map(({ data }) => data);
}
