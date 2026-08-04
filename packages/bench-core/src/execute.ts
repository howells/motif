import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { MotifError } from "@howells/motif-sdk";
import type {
  GenerateOptions,
  MotifResponse,
  Result,
} from "@howells/motif-sdk";

import type { AlignmentOk } from "./align-params";
import { sniffImageDimensions } from "./image-dimensions";

/**
 * Closed error vocabulary (`BRIEF.md` rule 2) — provider text (fal's error
 * messages, HTTP bodies) is read internally to pick one of these values and
 * then discarded. It never reaches the return value, a report, or a span.
 */
export type ExecuteErrorCode =
  | "DOWNLOAD_FAILED"
  | "HTTP_4XX"
  | "HTTP_5XX"
  | "INTERRUPTED"
  | "NO_IMAGE"
  | "RATE_LIMITED"
  | "SAFETY"
  | "TIMEOUT";

/**
 * The subset of `FalClient` that `execute.ts` needs — narrow enough that
 * tests inject a stub instead of a real network-capable client
 * (`BRIEF.md` non-negotiable: "No network in tests"). A real `FalClient`
 * satisfies this structurally; no adapter needed.
 */
export interface GenerationClient {
  generate: (
    options: GenerateOptions
  ) => Promise<Result<MotifResponse, MotifError>>;
}

export interface ExecuteGenerationOptions {
  /** Absolute destination path. Written to a temp path in the same directory
   * and renamed into place — the row is never created before the image
   * exists on disk (`BRIEF.md`: fal CDN URLs expire). */
  readonly imagePath: string;
  readonly signal?: AbortSignal;
}

export interface ExecuteSuccess {
  readonly bytes: number;
  readonly contentType: string | null;
  readonly downloadMs: number;
  readonly falRequestId: string | null;
  /** Actual returned height, sniffed from the downloaded bytes. `null` when
   * the format wasn't recognized — never inferred from the request. */
  readonly height: number | null;
  readonly imagePath: string;
  readonly ok: true;
  readonly providerMs: number;
  readonly seedReturned: number | null;
  readonly totalMs: number;
  readonly width: number | null;
}

export interface ExecuteFailure {
  readonly downloadMs: number | null;
  readonly errorCode: ExecuteErrorCode;
  readonly ok: false;
  readonly providerMs: number | null;
  readonly totalMs: number;
}

export type ExecuteResult = ExecuteFailure | ExecuteSuccess;

const isAbortError = (error: unknown): boolean =>
  (error instanceof Error && error.name === "AbortError") ||
  (error instanceof Error && /\babort/iu.test(error.message));

const isSafetyMessage = (message: string): boolean =>
  /safety|nsfw|content[ _-]?polic|flagged|moderat/iu.test(message);

/** Reads `signal.aborted` through a function call rather than inline, so
 * TypeScript's control-flow narrowing (which otherwise treats the readonly
 * `AbortSignal.aborted` getter as invariant after a prior `=== true` check)
 * doesn't wrongly narrow a second, later check to `false | undefined`. */
const isAborted = (signal: AbortSignal | undefined): boolean =>
  signal?.aborted === true;

/**
 * Maps a `MotifError` (or a thrown value) to the closed vocabulary. Reads
 * `error.message`/`error.status` only to pick a code — the message itself is
 * never returned, logged, or persisted from here.
 */
const classifyError = (error: unknown): ExecuteErrorCode => {
  if (isAbortError(error)) {
    return "INTERRUPTED";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out/iu.test(message)) {
    return "TIMEOUT";
  }
  const status = error instanceof MotifError ? error.status : 0;
  if (status === 429) {
    return "RATE_LIMITED";
  }
  if (isSafetyMessage(message)) {
    return "SAFETY";
  }
  if (status >= 500) {
    return "HTTP_5XX";
  }
  if (status >= 400) {
    return "HTTP_4XX";
  }
  // status 0 (non-HTTP local error, e.g. a network failure surfaced as a
  // plain Error, or a stub throwing something unrecognized) with no better
  // signal — treat as a server-side class of failure rather than fabricating
  // a new vocabulary entry.
  return "HTTP_5XX";
};

/** Writes to `${imagePath}.tmp-<random>` in the same directory, then renames
 * into place — atomic on the same filesystem, so a reader never observes a
 * partially-written file at `imagePath`. */
const writeImageAtomically = async (
  imagePath: string,
  bytes: Buffer
): Promise<void> => {
  await mkdir(path.dirname(imagePath), { recursive: true });
  const tempPath = `${imagePath}.tmp-${randomUUID()}`;
  await writeFile(tempPath, bytes);
  await rename(tempPath, imagePath);
};

/**
 * Runs one generation attempt end to end: the provider call, the download,
 * and the disk write — the only module that does any of the three
 * (`BRIEF.md` rule 4, purity split). `client` is injected so tests never
 * touch the network; `performance.now()` is measured separately around the
 * provider call and around download+disk write so `providerMs` never
 * includes local I/O.
 */
export const executeGeneration = async (
  client: GenerationClient,
  alignment: AlignmentOk,
  options: ExecuteGenerationOptions
): Promise<ExecuteResult> => {
  const totalStart = performance.now();
  const totalMs = (): number => performance.now() - totalStart;

  if (isAborted(options.signal)) {
    return {
      downloadMs: null,
      errorCode: "INTERRUPTED",
      ok: false,
      providerMs: null,
      totalMs: totalMs(),
    };
  }

  const providerStart = performance.now();
  let response: Result<MotifResponse, MotifError>;
  try {
    response = await client.generate(alignment.options);
  } catch (error) {
    return {
      downloadMs: null,
      errorCode: classifyError(error),
      ok: false,
      providerMs: performance.now() - providerStart,
      totalMs: totalMs(),
    };
  }
  const providerMs = performance.now() - providerStart;

  if (response.isErr()) {
    return {
      downloadMs: null,
      errorCode: classifyError(response.error),
      ok: false,
      providerMs,
      totalMs: totalMs(),
    };
  }

  const [image] = response.value.images;
  if (image === undefined || image.url.length === 0) {
    return {
      downloadMs: null,
      errorCode: "NO_IMAGE",
      ok: false,
      providerMs,
      totalMs: totalMs(),
    };
  }

  if (isAborted(options.signal)) {
    return {
      downloadMs: null,
      errorCode: "INTERRUPTED",
      ok: false,
      providerMs,
      totalMs: totalMs(),
    };
  }

  const downloadStart = performance.now();
  let bytes: Buffer;
  let contentType: string | null;
  try {
    const downloadResponse = await fetch(image.url, { signal: options.signal });
    if (!downloadResponse.ok) {
      return {
        downloadMs: performance.now() - downloadStart,
        errorCode: "DOWNLOAD_FAILED",
        ok: false,
        providerMs,
        totalMs: totalMs(),
      };
    }
    contentType = downloadResponse.headers.get("content-type");
    bytes = Buffer.from(await downloadResponse.arrayBuffer());
  } catch (error) {
    return {
      downloadMs: performance.now() - downloadStart,
      errorCode: isAbortError(error) ? "INTERRUPTED" : "DOWNLOAD_FAILED",
      ok: false,
      providerMs,
      totalMs: totalMs(),
    };
  }

  try {
    await writeImageAtomically(options.imagePath, bytes);
  } catch {
    return {
      downloadMs: performance.now() - downloadStart,
      errorCode: "DOWNLOAD_FAILED",
      ok: false,
      providerMs,
      totalMs: totalMs(),
    };
  }

  const downloadMs = performance.now() - downloadStart;
  const dimensions = sniffImageDimensions(bytes);

  return {
    bytes: bytes.byteLength,
    contentType,
    downloadMs,
    falRequestId: response.value.requestId ?? null,
    height: dimensions?.height ?? null,
    imagePath: options.imagePath,
    ok: true,
    providerMs,
    seedReturned: response.value.seed ?? null,
    totalMs: totalMs(),
    width: dimensions?.width ?? null,
  };
};
