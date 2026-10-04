import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";
import { z } from "zod";

import { falHttpError, MotifError } from "./errors";
import { asNumber, asString, isRecord, requestIdFromBody } from "./fal-parse";
import { MODELS } from "./models";
import type { TaskFile, TaskPlan } from "./task-client";
import { collectUrls } from "./task-output";
import type { FalFetch } from "./types";

export interface TaskStreamOptions {
  signal?: AbortSignal;
  /** Overall deadline covering connection and consumption, in milliseconds. */
  timeout?: number;
}

interface EventMetadata {
  event?: string;
  id?: string;
}
export type TaskStreamEvent = EventMetadata &
  (
    | { type: "images"; files: TaskFile[]; raw: unknown }
    | { type: "progress"; progress?: number; message?: string; raw: unknown }
    | { type: "provider"; data: unknown }
  );

export interface TaskStream {
  plan: TaskPlan;
  requestId?: string;
  /** Single-use stream. EOF does not establish generation success. */
  events: AsyncIterable<Result<TaskStreamEvent, MotifError>>;
  /** Stops local consumption; does not guarantee provider cancellation or refund. */
  abort: () => void;
}

const MAX_EVENT_CHARACTERS = 16 * 1024 * 1024;
const JSON_START = /^[[{]/;

interface ProviderPayload {
  raw: unknown;
  files: TaskFile[];
  progress?: number;
  message?: string;
  error?: string;
}

function parsePayload(text: string): ProviderPayload {
  let raw: unknown;
  try {
    raw = z.json().parse(JSON.parse(text));
  } catch (error) {
    if (JSON_START.test(text.trim())) {
      throw error;
    }
    raw = text;
  }
  if (!isRecord(raw) || Array.isArray(raw)) {
    return { raw, files: [] };
  }
  const images = Object.fromEntries(
    ["images", "image"].map((key) => {
      const value = raw[key];
      const parsed = z.array(z.json()).safeParse(value);
      const values = parsed.success ? parsed.data : [value];
      return [
        key,
        values.map((item) => {
          const url = asString(item);
          return url?.startsWith("data:image/") === true ? { url } : item;
        }),
      ];
    })
  );
  const number = asNumber(raw.progress);
  const progress =
    number !== undefined &&
    Number.isFinite(number) &&
    number >= 0 &&
    number <= 1
      ? number
      : undefined;
  const message = asString(raw.message);
  const error =
    raw.error !== undefined && raw.error !== null
      ? (asString(raw.detail) ??
        message ??
        "Provider reported a streaming error.")
      : undefined;
  return {
    raw,
    files: collectUrls(images, ["images", "image"]),
    progress,
    message,
    error,
  };
}

function normalise(
  payload: ProviderPayload,
  metadata: EventMetadata
): TaskStreamEvent {
  const { raw, files, progress, message } = payload;
  if (files.length > 0) {
    return { ...metadata, type: "images", files, raw };
  }
  if (progress !== undefined || message !== undefined) {
    return {
      ...metadata,
      type: "progress",
      ...(progress !== undefined && { progress }),
      ...(message !== undefined && { message }),
      raw,
    };
  }
  return { ...metadata, type: "provider", data: raw };
}

function validateStream(
  plan: TaskPlan,
  key: string | undefined,
  options: TaskStreamOptions
): MotifError | undefined {
  const model = MODELS[plan.model];
  const supported =
    model !== undefined &&
    ((plan.endpoint === model.endpoint &&
      model.streaming?.generation === true) ||
      (plan.endpoint === model.editEndpoint && model.streaming?.edit === true));
  if (plan.provider !== "fal" || !supported) {
    return new MotifError(
      "The resolved route does not support streaming.",
      0,
      "STREAMING_UNSUPPORTED",
      undefined,
      { model: plan.model, endpoint: plan.endpoint }
    );
  }
  if (key === undefined) {
    return new MotifError(
      "FAL_KEY is not set.",
      0,
      "MISSING_API_KEY",
      undefined,
      {
        envVar: "FAL_KEY",
      }
    );
  }
  if (
    options.timeout !== undefined &&
    (!Number.isFinite(options.timeout) || options.timeout <= 0)
  ) {
    return new MotifError(
      "Stream timeout must be a positive finite number.",
      0,
      "INVALID_OPTION"
    );
  }

  return undefined;
}

function createSession(options: TaskStreamOptions) {
  const controller = new AbortController();
  let timedOut = false;
  let requestId: string | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = (): void => {
    controller.abort();
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted === true) {
    abort();
  }
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
    void cleanup();
  }, options.timeout ?? 120_000);
  const cleanup = async (): Promise<void> => {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    controller.abort();
    try {
      await reader?.cancel();
    } catch {
      /* Transport is already closed. */
    }
  };
  const failure = (cause?: unknown): MotifError => {
    if (controller.signal.aborted) {
      return new MotifError(
        timedOut ? "Stream deadline exceeded." : "Stream aborted.",
        0,
        timedOut ? "TIMEOUT" : "ABORTED",
        requestId
      );
    }
    return cause instanceof MotifError
      ? cause
      : new MotifError(
          cause instanceof Error ? cause.message : String(cause),
          0,
          "STREAM_ERROR",
          requestId
        );
  };
  const cancellable = async <T>(operation: Promise<T>): Promise<T> => {
    if (controller.signal.aborted) {
      throw failure();
    }
    let rejectAbort: (() => void) | undefined;
    const interrupted = new Promise<never>((_, reject) => {
      rejectAbort = () => {
        reject(failure());
      };
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    try {
      return await Promise.race([operation, interrupted]);
    } finally {
      if (rejectAbort !== undefined) {
        controller.signal.removeEventListener("abort", rejectAbort);
      }
    }
  };

  return {
    controller,
    failure,
    cleanup,
    cancellable,
    setRequestId(value: string | undefined) {
      requestId = value;
    },
    setReader(value: ReadableStreamDefaultReader<Uint8Array>) {
      reader = value;
    },
  };
}

type StreamSession = ReturnType<typeof createSession>;

/** Direct inference streaming. Never submits to the queue or retries. */
export async function streamTask(
  plan: TaskPlan,
  key: string | undefined,
  fetch: FalFetch,
  ephemeral: boolean,
  options: TaskStreamOptions
): Promise<Result<TaskStream, MotifError>> {
  const invalid = validateStream(plan, key, options);
  if (invalid !== undefined) {
    return err(invalid);
  }
  // Validation established the key; keep its absence explicit for the type system.
  if (key === undefined) {
    return err(new MotifError("FAL_KEY is not set.", 0, "MISSING_API_KEY"));
  }

  const session = createSession(options);
  const { controller, failure, cleanup, cancellable } = session;
  let requestId: string | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    if (controller.signal.aborted) {
      throw failure();
    }
    const response = await cancellable(
      fetch(`https://fal.run/${plan.endpoint}/stream`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Key ${key}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(ephemeral && { "X-Fal-Store-IO": "0" }),
        },
        body: JSON.stringify(plan.body),
      })
    );
    requestId = response.headers.get("x-fal-request-id") ?? undefined;
    session.setRequestId(requestId);
    if (!response.ok) {
      const body = await cancellable(response.text());
      const error = falHttpError(
        response.status,
        body,
        requestId ?? requestIdFromBody(body)
      );
      await cleanup();
      return err(error);
    }
    if (
      response.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("text/event-stream") !== true ||
      response.body === null
    ) {
      await response.body?.cancel();
      await cleanup();
      return err(
        new MotifError(
          "Expected an SSE response body.",
          response.status,
          "INVALID_STREAM_RESPONSE",
          requestId
        )
      );
    }
    reader = response.body.getReader();
    session.setReader(reader);
  } catch (error) {
    const failed = failure(error);
    await cleanup();
    return err(failed);
  }

  const iterator = consume(reader, session, requestId);
  let claimed = false;
  const events: AsyncIterable<Result<TaskStreamEvent, MotifError>> = {
    [Symbol.asyncIterator]() {
      if (claimed) {
        throw new Error("Stream events can only be consumed once.");
      }
      claimed = true;
      return {
        next: async () => await iterator.next(),
        async return() {
          await cleanup();
          const end = undefined;
          return await iterator.return(end);
        },
      };
    },
  };
  return ok({
    plan,
    ...(requestId !== undefined && { requestId }),
    events,
    abort() {
      controller.abort();
      void cleanup();
    },
  });
}

async function* consume(
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
  session: StreamSession,
  requestId: string | undefined
): AsyncGenerator<Result<TaskStreamEvent, MotifError>> {
  const { cancellable, failure, cleanup } = session;
  const decoder = new TextDecoder();
  const frames = createFrames(requestId);
  try {
    if (reader === undefined) {
      throw new Error("Missing stream reader.");
    }
    let finished = false;
    while (!finished) {
      const chunk = await cancellable(reader.read());
      finished = chunk.done;
      frames.append(
        chunk.done
          ? decoder.decode()
          : decoder.decode(chunk.value, { stream: true }),
        finished
      );
      let frame = frames.next();
      while (frame !== undefined) {
        if (frame === "done") {
          return;
        }
        yield frame;
        if (frame.isErr()) {
          return;
        }
        frame = frames.next();
      }
    }
    // SSE requires a blank-line terminator. An incomplete EOF event is discarded.
  } catch (error) {
    yield err(failure(error));
  } finally {
    await cleanup();
  }
}

function createFrames(requestId: string | undefined) {
  let buffer = "";
  let finished = false;
  let data: string[] = [];
  let event: string | undefined;
  let id: string | undefined;
  let length = 0;
  const parse = ():
    | Result<TaskStreamEvent, MotifError>
    | "done"
    | undefined => {
    if (data.length === 0) {
      event = undefined;
      length = 0;
      return undefined;
    }
    const text = data.join("\n");
    const metadata = {
      ...(event !== undefined && { event }),
      ...(id !== undefined && { id }),
    };
    data = [];
    event = undefined;
    length = 0;
    if (text.trim() === "[DONE]") {
      return "done";
    }
    let payload: ProviderPayload;
    try {
      payload = parsePayload(text);
    } catch {
      return err(
        new MotifError(
          "Malformed JSON in stream event.",
          0,
          "INVALID_STREAM_DATA",
          requestId
        )
      );
    }
    if (metadata.event === "error" || payload.error !== undefined) {
      return err(
        new MotifError(
          payload.error ??
            payload.message ??
            "Provider reported a streaming error.",
          0,
          "STREAM_ERROR",
          requestId,
          { data: payload.raw }
        )
      );
    }
    return ok(normalise(payload, metadata));
  };

  function acceptField(line: string): void {
    if (line.startsWith(":")) {
      return;
    }
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "data") {
      data.push(value);
    } else if (field === "event") {
      event = value;
    } else if (field === "id" && !value.includes("\0")) {
      id = value;
    }
  }
  function next(): Result<TaskStreamEvent, MotifError> | "done" | undefined {
    // Keep the CR until the next chunk if it might belong to CRLF.
    while (buffer.length > 0) {
      const lf = buffer.search(/[\r\n]/);
      if (
        lf < 0 ||
        (!finished && lf === buffer.length - 1 && buffer[lf] === "\r")
      ) {
        break;
      }
      const line = buffer.slice(0, lf);
      const width = buffer[lf] === "\r" && buffer[lf + 1] === "\n" ? 2 : 1;
      buffer = buffer.slice(lf + width);
      length += line.length;
      enforceBufferLimit(length, requestId);
      if (line === "") {
        const parsed = parse();
        if (parsed === "done") {
          return "done";
        }
        if (parsed !== undefined) {
          return parsed;
        }
      } else {
        acceptField(line);
      }
    }
    enforceBufferLimit(length + buffer.length, requestId);
    return undefined;
  }
  return {
    next,
    append(text: string, done: boolean) {
      buffer += text;
      finished = done;
    },
  };
}

function enforceBufferLimit(
  length: number,
  requestId: string | undefined
): void {
  if (length > MAX_EVENT_CHARACTERS) {
    throw new MotifError(
      "Stream event exceeds the buffer limit.",
      0,
      "STREAM_EVENT_TOO_LARGE",
      requestId
    );
  }
}
