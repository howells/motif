/**
 * The browser's side of the App's API. Every call is same-origin JSON; a
 * failure becomes an `ApiError` carrying the server's code and sentence, so a
 * screen can say exactly what happened.
 */
import type { z } from "zod";

export class ApiError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly status: number;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "ApiError";
    this.status = status;
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const failure = async (response: Response): Promise<ApiError> => {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const record = isRecord(body) ? body : {};
  const code =
    typeof record.code === "string" ? record.code : `HTTP_${response.status}`;
  const message =
    typeof record.error === "string"
      ? record.error
      : "Something went wrong. Try again.";
  return new ApiError(response.status, code, message, record);
};

const parsed = <T>(schema: z.ZodType<T>, body: unknown, status: number): T => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(
      status,
      "UNEXPECTED_RESPONSE",
      "The App sent back something this page doesn’t understand. Reload and try again.",
      {}
    );
  }
  return result.data;
};

/** GET or POST JSON, checking the reply against the shape the caller expects
 * before anything on screen uses it. */
export const api = async <T>(
  path: string,
  schema: z.ZodType<T>,
  init?: { readonly body?: unknown; readonly method?: "PATCH" | "POST" }
): Promise<T> => {
  const response = await fetch(path, {
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    credentials: "same-origin",
    headers:
      init?.body === undefined
        ? undefined
        : { "content-type": "application/json" },
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
  });
  if (!response.ok) {
    throw await failure(response);
  }
  const body: unknown = await response.json();
  return parsed(schema, body, response.status);
};

/** POST a file as a form upload, checking the reply like `api`. */
export const upload = async <T>(
  path: string,
  schema: z.ZodType<T>,
  form: FormData
): Promise<T> => {
  const response = await fetch(path, {
    body: form,
    credentials: "same-origin",
    method: "POST",
  });
  if (!response.ok) {
    throw await failure(response);
  }
  const body: unknown = await response.json();
  return parsed(schema, body, response.status);
};

/** A fresh key for one press of Run. Sending it again never runs twice. */
export const newKey = (): string => crypto.randomUUID();

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong. Try again.";
