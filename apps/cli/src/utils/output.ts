/**
 * Structured output system for agent-first CLI design.
 *
 * - TTY (interactive terminal) → human-readable colored output
 * - Piped (non-TTY) → JSON per line (NDJSON)
 * - Explicit --format flag overrides detection
 */

import chalk from "chalk";

import { getErrorMetadata } from "./error-catalog";
import type { KnownErrorCode } from "./error-catalog";
import { hasText } from "./text";

/** Narrow an unknown value to a plain (non-array) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type OutputFormat = "human" | "json" | "ndjson";

/** Detect if stdout is an interactive terminal */
function isInteractive(): boolean {
  return process.stdout.isTTY;
}

/** Resolve the output format from explicit flag or TTY detection */
export function resolveFormat(explicit?: string): OutputFormat {
  if (explicit === "json" || explicit === "ndjson" || explicit === "human") {
    return explicit;
  }
  return isInteractive() ? "human" : "json";
}

/** Filter an object to only include specified fields */
function applyFieldMask(
  data: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in data) {
      result[field] = data[field];
    }
  }
  return result;
}

/**
 * Sanitize a value against prompt injection in API responses.
 * Strips instruction-like patterns from string values before outputting.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    // Strip common prompt injection patterns from API response data
    return value
      .replaceAll(
        /\b(SYSTEM|INSTRUCTION|IGNORE PREVIOUS)\b.*$/gim,
        "[FILTERED]"
      )
      .replaceAll(/<\/?(?:system|instruction|prompt)[^>]*>/gi, "[FILTERED]");
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (isRecord(value)) {
    return sanitizeObject(value);
  }
  return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = sanitizeValue(val);
  }
  return result;
}

export interface EmitOptions {
  /** Comma-separated field names to include (omit for all) */
  fields?: string;
  /** Explicit output format */
  format: OutputFormat;
  /** Sanitize response data against prompt injection */
  sanitize?: boolean;
}

/** `data` narrowed to a comma-separated field list, or whole when there is none. */
export function maskFields(
  data: Record<string, unknown>,
  fields: string | undefined
): Record<string, unknown> {
  if (!hasText(fields)) {
    return data;
  }
  return applyFieldMask(
    data,
    fields.split(",").map((f) => f.trim())
  );
}

/** Emit a single structured result */
export function emit(
  data: Record<string, unknown>,
  options: EmitOptions
): void {
  if (options.format === "json" || options.format === "ndjson") {
    process.stdout.write(`${JSON.stringify(shaped(data, options))}\n`);
  }
  // Human format is handled by callers — this function is for structured output
}

/**
 * Emit a document with no human rendering of its own, such as a schema: human
 * format prints it as indented JSON rather than printing nothing.
 */
export function emitDocument(
  data: Record<string, unknown>,
  options: EmitOptions
): void {
  if (options.format === "human") {
    process.stdout.write(`${JSON.stringify(shaped(data, options), null, 2)}\n`);
    return;
  }
  emit(data, options);
}

/** `data` sanitized and masked to `--fields` as the options ask. */
function shaped(
  data: Record<string, unknown>,
  options: EmitOptions
): Record<string, unknown> {
  const output = options.sanitize === true ? sanitizeObject(data) : data;
  if (!hasText(options.fields)) {
    return output;
  }
  const fieldList = options.fields.split(",").map((f) => f.trim());
  return applyFieldMask(output, fieldList);
}

/** Emit multiple items as NDJSON (one JSON object per line) */
export function emitStream(
  items: Record<string, unknown>[],
  options: EmitOptions
): void {
  for (const item of items) {
    emit(item, { ...options, format: "ndjson" });
  }
}

/** Structured error output — RFC 7807 Problem Details for HTTP APIs */
export interface StructuredError {
  /** Problem type URI (RFC 7807 `type`) */
  type: string;
  /** Human-readable summary (RFC 7807 `title`) */
  title: string;
  /** HTTP-equivalent status code (RFC 7807 `status`) */
  status: number;
  /** Machine-readable error code */
  code: KnownErrorCode;
  /** Human-readable detail message */
  message: string;
  /** Additional context */
  details?: unknown;
  /** RFC 7807 `instance` — a URI identifying this specific occurrence. Set to
   * the fal request URN when a failure originated at fal. */
  instance?: string;
  /** Stable local documentation pointer for this error code */
  doc_uri: string;
  /** Sentinel: always true */
  error: true;
  /** Whether retrying the same request may succeed */
  is_retriable: boolean;
  /** Recovery hints for agents */
  suggestions?: string[];
}

/** Emit a structured error. Its RFC 7807 fields all come from the code's catalog entry. */
export function emitError(
  error: {
    code: KnownErrorCode;
    message: string;
    details?: unknown;
    instance?: string;
    suggestions?: string[];
  },
  format: OutputFormat
): void {
  const metadata = getErrorMetadata(error.code);

  // Presence check matches the original truthiness: falsy details (undefined,
  // null, "", 0, false) are omitted from the envelope.
  const hasDetails = Boolean(error.details);
  const suggestions = error.suggestions ?? metadata.suggestions;

  const structured: StructuredError = {
    type: metadata.type,
    title: metadata.title,
    status: metadata.status,
    doc_uri: metadata.docUri,
    error: true,
    code: error.code,
    message: error.message,
    ...(hasDetails ? { details: error.details } : {}),
    ...(hasText(error.instance) ? { instance: error.instance } : {}),
    is_retriable: metadata.isRetriable,
    ...(suggestions ? { suggestions } : {}),
  };

  if (format === "json" || format === "ndjson") {
    process.stderr.write(`${JSON.stringify(structured)}\n`);
  } else {
    process.stderr.write(
      `${chalk.red(`Error [${error.code}]: ${error.message}`)}\n`
    );
  }
}

/** Check if output is structured (agent mode) */
export function isStructured(format: OutputFormat): boolean {
  return format === "json" || format === "ndjson";
}

/** The human line for a file a run wrote: its path, size and pixel size if known. */
export function savedLine(file: {
  height?: number;
  path: string;
  size: string;
  width?: number;
}): string {
  const dims =
    file.width !== undefined && file.height !== undefined
      ? `${file.width}x${file.height}, `
      : "";
  return (
    chalk.green(`✓ Saved: ${file.path}`) + chalk.dim(` (${dims}${file.size})`)
  );
}
