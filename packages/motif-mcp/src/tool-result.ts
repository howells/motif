/**
 * Shared MCP tool reply and argument-validation helpers.
 *
 * Extracted from `create-server.ts` so the capability tools in
 * `capability-tools.ts` return the same error envelope and validate arguments
 * to the same standard, rather than growing a second convention alongside it.
 */

/**
 * A tool reply: the JSON payload as text, and the same object as structured
 * content.
 *
 * The index signature is load-bearing, not decoration: the MCP SDK types a
 * handler result as a loose `{ [x: string]: unknown }` object, and an
 * interface without one is not assignable to it.
 */
export interface ToolReply {
  [key: string]: unknown;
  content: { text: string; type: "text" }[];
  isError?: boolean;
  structuredContent: Record<string, unknown>;
}

/** Wrap a structured payload as a successful tool reply. */
export function toolReply(structured: Record<string, unknown>): ToolReply {
  return {
    content: [{ text: JSON.stringify(structured), type: "text" }],
    structuredContent: structured,
  };
}

export function toolError(
  code: string,
  message: string,
  options: {
    isRetriable?: boolean;
    suggestions?: string[];
    traceId?: string;
  } = {}
): ToolReply {
  const structured = {
    code,
    error: true,
    is_retriable: options.isRetriable ?? false,
    message,
    suggestions: options.suggestions ?? [],
    ...(options.traceId === undefined ? {} : { trace_id: options.traceId }),
  };

  return {
    content: [{ text: JSON.stringify(structured), type: "text" }],
    isError: true,
    structuredContent: structured,
  };
}

export function invalidParams(
  message: string,
  suggestions: string[]
): ToolReply {
  return toolError("INVALID_PARAMS", message, { suggestions });
}

/**
 * Result of narrowing an optional enum argument.
 *
 * `ok: true` carries the matched member (or `undefined` when the argument was
 * absent); `ok: false` carries the user-facing validation message.
 */
export type ParsedEnum<T> =
  | { error: string; ok: false }
  | { ok: true; value?: T };

/**
 * Narrow an optional value to a member of `allowed`.
 *
 * Absent values are accepted as `undefined`; present values must match a
 * member exactly, otherwise a validation message is returned. Replaces blind
 * `args as {...}` casts with a real type guard now that MOT-10 added runtime
 * validation upstream.
 */
export function parseOptionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): ParsedEnum<T> {
  if (value === undefined) {
    return { ok: true };
  }
  const match = allowed.find((option) => option === value);
  if (match === undefined) {
    return { error: `Invalid ${field}: ${JSON.stringify(value)}`, ok: false };
  }
  return { ok: true, value: match };
}

/** Build a suggestion string listing valid enum values (truncated if long). */
export function enumSuggestion(
  field: string,
  allowed: readonly string[]
): string {
  const shown = allowed.slice(0, 20);
  const suffix = allowed.length > shown.length ? ", …" : "";
  return `Valid ${field} values: ${shown.join(", ")}${suffix}`;
}

/** Narrow a required image URL argument, or return the validation message. */
export function parseImageUrl(
  value: unknown,
  toolName: string
): { error: ToolReply; ok: false } | { ok: true; value: string } {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      error: invalidParams(`${toolName} requires a non-empty imageUrl.`, [
        "Pass the URL of the image to process.",
      ]),
      ok: false,
    };
  }
  return { ok: true, value };
}
