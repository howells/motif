/**
 * The authenticated HTTP calls the Task client makes to fal: one request with
 * retry and timeout, the queue's job status, storage upload and payload
 * deletion. Every function takes the connection it runs on.
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { falHttpError, isFalAccountLocked, MotifError } from "./errors";
import {
  asNumber,
  asString,
  isRecord,
  parseLogs,
  requestIdFromBody,
  toHeaderRecord,
} from "./fal-parse";
import type { FalFetch, JobStatus } from "./types";

export const FAL_BASE_URL = "https://fal.run";
export const FAL_QUEUE_URL = "https://queue.fal.run";
const FAL_API_URL = "https://api.fal.ai";
const FAL_REST_URL = "https://rest.alpha.fal.ai";

const globalFetch: FalFetch = async (url, init) => await fetch(url, init);

/** What every fal call needs: the key, the network seam and its limits. */
export interface FalConnection {
  apiKey: string;
  fetch: FalFetch;
  /** Max retry attempts for 429/5xx and network errors; 0 disables. */
  retries: number;
  /** Request timeout in ms. */
  timeout: number;
}

/** A connection with the default fetch, 3 retries and a 120 second timeout. */
export function falConnection(
  apiKey: string,
  options: { fetch?: FalFetch; retries?: number; timeout?: number } = {}
): FalConnection {
  return {
    apiKey,
    fetch: options.fetch ?? globalFetch,
    retries: options.retries ?? 3,
    timeout: options.timeout ?? 120_000,
  };
}

/** Authenticated fetch to fal.ai APIs with retry logic. */
export async function request(
  connection: FalConnection,
  url: string,
  options: RequestInit = {}
): Promise<Result<Response, MotifError>> {
  let lastError: MotifError | null = null;

  for (let attempt = 0; attempt <= connection.retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, connection.timeout);

    try {
      const response = await connection.fetch(url, {
        ...options,
        headers: {
          Authorization: `Key ${connection.apiKey}`,
          "Content-Type": "application/json",
          ...toHeaderRecord(options.headers),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Retry on 429 or 5xx
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt < connection.retries
      ) {
        const delay = 1000 * 2 ** attempt; // 1s, 2s, 4s
        await new Promise((r) => {
          setTimeout(r, delay);
        });
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        const requestId =
          response.headers.get("x-fal-request-id") ?? requestIdFromBody(text);
        return err(falHttpError(response.status, text, requestId));
      }

      return ok(response);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof MotifError) {
        return err(error);
      }

      lastError = new MotifError(
        error instanceof Error ? error.message : String(error),
        0
      );

      // Retry on network errors
      if (attempt < connection.retries) {
        const delay = 1000 * 2 ** attempt;
        await new Promise((r) => {
          setTimeout(r, delay);
        });
      }
    }
  }

  return err(lastError ?? new MotifError("Request failed after retries", 0));
}

/** Check the status of a queued run. */
export async function getJobStatus(
  connection: FalConnection,
  endpoint: string,
  requestId: string
): Promise<Result<JobStatus, MotifError>> {
  const url = `${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}/status?logs=1`;
  const response = await request(connection, url);
  if (response.isErr()) {
    return err(response.error);
  }

  const data: unknown = await response.value.json();
  const record = isRecord(data) ? data : {};
  const rawStatus = asString(record.status);

  let status: JobStatus["status"];
  if (rawStatus === "IN_QUEUE") {
    status = "queued";
  } else if (rawStatus === "IN_PROGRESS") {
    status = "processing";
  } else if (rawStatus === "COMPLETED") {
    status = "completed";
  } else if (
    rawStatus === "FAILED" ||
    rawStatus === "ERROR" ||
    rawStatus === "CANCELED"
  ) {
    status = "failed";
  } else {
    return err(new MotifError(`Unknown job status: ${rawStatus}`, 0));
  }

  return ok({
    error: asString(record.error) ?? asString(record.detail),
    logs: parseLogs(record.logs),
    queuePosition: asNumber(record.queue_position),
    status,
  });
}

/**
 * Upload a file to fal.ai CDN storage and return the public URL.
 * Uses the two-step initiate + PUT flow.
 */
export async function uploadToFalCdn(
  connection: FalConnection,
  file: ArrayBuffer | Uint8Array,
  options: { contentType: string; fileName: string }
): Promise<Result<string, MotifError>> {
  const initiateResponse = await request(
    connection,
    `${FAL_REST_URL}/storage/upload/initiate?storage_type=fal-cdn-v3`,
    {
      body: JSON.stringify({
        content_type: options.contentType,
        file_name: options.fileName,
      }),
      method: "POST",
    }
  );
  if (initiateResponse.isErr()) {
    return err(initiateResponse.error);
  }

  const initiateData: unknown = await initiateResponse.value.json();
  const fileUrl = isRecord(initiateData)
    ? (asString(initiateData.file_url) ?? "")
    : "";
  const uploadUrl = isRecord(initiateData)
    ? asString(initiateData.upload_url)
    : undefined;

  if (uploadUrl === undefined || uploadUrl === "") {
    return err(
      new MotifError("Upload initiate response missing upload_url", 0)
    );
  }

  let putResponse: Response;
  try {
    const body = Buffer.from(
      file instanceof Uint8Array ? file : new Uint8Array(file)
    );
    putResponse = await connection.fetch(uploadUrl, {
      body,
      headers: { "Content-Type": options.contentType },
      method: "PUT",
    });
  } catch (error) {
    return err(
      new MotifError(
        `Upload PUT failed: ${error instanceof Error ? error.message : String(error)}`,
        0
      )
    );
  }

  if (!putResponse.ok) {
    const text = await putResponse.text();
    if (isFalAccountLocked(putResponse.status, text)) {
      return err(falHttpError(putResponse.status, text));
    }
    return err(
      new MotifError(
        `Upload PUT failed: ${putResponse.status}`,
        putResponse.status
      )
    );
  }

  return ok(fileUrl);
}

/**
 * Delete fal's stored IO payloads for a completed request.
 *
 * This removes request input/output payload files exposed by fal's payloads
 * API. It does not remove billing/account metadata or input files separately
 * uploaded to fal storage before a request.
 */
export async function deletePayloads(
  connection: FalConnection,
  requestId: string
): Promise<Result<void, MotifError>> {
  const response = await request(
    connection,
    `${FAL_API_URL}/v1/models/requests/${encodeURIComponent(requestId)}/payloads`,
    { method: "DELETE" }
  );
  if (response.isErr()) {
    return err(response.error);
  }
  return ok();
}
