/**
 * `MotifError` and its coercion helper.
 *
 * Extracted from `server.ts` so `server-tools.ts` can construct errors without
 * importing back into `server.ts` — that import was a dependency cycle. Both
 * `server.ts` and `server-tools.ts` import from here, and `server.ts`
 * re-exports `MotifError` so the package's public surface is unchanged.
 */

export class MotifError extends Error {
  readonly status: number;
  readonly code?: string;
  /** fal's request-correlation id (from the `x-fal-request-id` header or the
   * error body). Ties a failure back to fal's dashboard/support. */
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    requestId?: string
  ) {
    super(message);
    this.name = "MotifError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Coerce an unknown thrown value into a `MotifError`.
 *
 * Preserves an existing `MotifError`, and lifts a string `code` field (e.g.
 * `CreativeOptionError`'s `"INVALID_OPTION"`) onto the returned error so callers
 * keep structured error metadata. Status `0` marks a non-HTTP local error.
 */
export function toMotifError(error: unknown): MotifError {
  if (error instanceof MotifError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
  return new MotifError(message, 0, code);
}
