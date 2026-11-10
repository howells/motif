/**
 * Running a prepared request on fal: synchronously, or through the queue with
 * polling until the result is in.
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { MotifError } from "./errors";
import { FAL_BASE_URL, FAL_QUEUE_URL, getJobStatus, request } from "./fal-http";
import type { FalConnection } from "./fal-http";
import {
  asString,
  endpointFromQueueUrl,
  isRecord,
  parseQueueSubmission,
} from "./fal-parse";
import type { JobStatus, QueuedJob } from "./types";

/** Poll cadence for queued runs. */
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 160;

type OnProgress = (
  status: JobStatus["status"],
  queuePosition?: number,
  logs?: readonly { message: string; timestamp: string }[]
) => void;

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
  connection: FalConnection,
  prepared: PreparedFalRequest
): Promise<Result<FalRequestResult, MotifError>> {
  const response = await request(
    connection,
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
async function submitRequest(
  connection: FalConnection,
  prepared: PreparedFalRequest
): Promise<Result<QueuedJob, MotifError>> {
  const response = await request(
    connection,
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

/** Fetch the finished payload for a queued run. */
async function getJobResult(
  connection: FalConnection,
  job: QueuedJob
): Promise<Result<Record<string, unknown>, MotifError>> {
  const url = `${FAL_QUEUE_URL}/${job.endpoint}/requests/${job.requestId}`;
  const response = await request(connection, url);
  if (response.isErr()) {
    return err(response.error);
  }

  const data: unknown = await response.value.json();
  return ok(isRecord(data) ? data : {});
}

/** Poll a submitted job to completion and fetch its result. Submits nothing. */
export async function awaitQueuedRequest(
  connection: FalConnection,
  job: QueuedJob,
  onProgress?: OnProgress
): Promise<Result<FalRequestResult, MotifError>> {
  // fal sends the whole log on every poll; the caller is told only what is new.
  let logsSeen = 0;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const status = await getJobStatus(connection, job.endpoint, job.requestId);
    if (status.isErr()) {
      return err(status.error);
    }

    const logs = status.value.logs ?? [];
    const fresh = logs.slice(logs.length < logsSeen ? 0 : logsSeen);
    logsSeen = logs.length;
    if (fresh.length > 0) {
      onProgress?.(status.value.status, status.value.queuePosition, fresh);
    } else {
      onProgress?.(status.value.status, status.value.queuePosition);
    }

    if (status.value.status === "completed") {
      const result = await getJobResult(connection, job);
      return result.map((data) => ({ data, requestId: job.requestId }));
    }

    if (status.value.status === "failed") {
      const message = status.value.error ?? "Queued run failed";
      return err(new MotifError(message, 0, undefined, job.requestId));
    }

    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }

  return err(
    new MotifError("Queued run timed out", 0, undefined, job.requestId)
  );
}

/**
 * Submit a prepared request, poll it to completion and fetch the result.
 * `onSubmitted` hears the request id as soon as fal accepts the job, before
 * any wait, so a caller can keep it and resume the same job later.
 */
export async function runRequestQueued(
  connection: FalConnection,
  prepared: PreparedFalRequest,
  onProgress?: OnProgress,
  onSubmitted?: (requestId: string) => void
): Promise<Result<FalRequestResult, MotifError>> {
  const job = await submitRequest(connection, prepared);
  if (job.isErr()) {
    return err(job.error);
  }
  onSubmitted?.(job.value.requestId);
  return await awaitQueuedRequest(connection, job.value, onProgress);
}
