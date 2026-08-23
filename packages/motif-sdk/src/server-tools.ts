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

/** Body of `FalClient.runTool`. */
export async function runTool(
  exec: FalRequestExecutor,
  options: ToolRunOptions
): Promise<Result<ToolResponse, MotifError>> {
  const request = buildToolRequest(options);
  if (request.isErr()) {
    return err(request.error);
  }

  const response = await exec.request(
    `${FAL_BASE_URL}/${request.value.endpoint}`,
    {
      body: JSON.stringify(request.value.body),
      method: "POST",
    }
  );
  if (response.isErr()) {
    return err(response.error);
  }

  const data: unknown = await response.value.json();
  return ok(isRecord(data) ? data : {});
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

  const response = await exec.request(
    `${FAL_QUEUE_URL}/${request.value.endpoint}`,
    {
      body: JSON.stringify(request.value.body),
      method: "POST",
    }
  );
  if (response.isErr()) {
    return err(response.error);
  }

  const data: unknown = await response.value.json();
  const submission = parseQueueSubmission(data);

  return ok({
    endpoint: endpointFromQueueUrl(
      submission.responseUrl,
      request.value.endpoint
    ),
    requestId: submission.requestId,
  });
}

/** Body of `FalClient.checkToolStatus`. */
export async function checkToolStatus(
  exec: FalRequestExecutor,
  job: QueuedToolJob
): Promise<Result<JobStatus, MotifError>> {
  return await exec.getJobStatus(job.endpoint, job.requestId);
}

/** Body of `FalClient.getToolResult`. */
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

/** Body of `FalClient.runToolQueued`. */
export async function runToolQueued(
  exec: FalRequestExecutor,
  options: ToolRunOptions,
  onProgress?: (status: string, queuePosition?: number) => void
): Promise<Result<ToolResponse, MotifError>> {
  const job = await submitTool(exec, options);
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
      return await getToolResult(exec, job.value);
    }

    if (status.value.status === "failed") {
      const message = status.value.error ?? "Queued tool run failed";
      return err(new MotifError(message, 0, undefined, job.value.requestId));
    }

    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }

  return err(
    new MotifError(
      "Queued tool run timed out",
      0,
      undefined,
      job.value.requestId
    )
  );
}
