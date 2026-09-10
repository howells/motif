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

/** Error code for a fal account that is locked, usually for lack of credit. */
export const ACCOUNT_LOCKED = "ACCOUNT_LOCKED";

const ACCOUNT_LOCKED_DETAIL = "User is locked";

/**
 * Whether a fal HTTP failure means the account is locked.
 *
 * fal answers `403 {"detail":"User is locked. Reason: TOP_UP."}` when the
 * account has run out of credit. Retrying cannot help, and the key is valid.
 */
export function isFalAccountLocked(status: number, body: string): boolean {
  return status === 403 && body.includes(ACCOUNT_LOCKED_DETAIL);
}

/**
 * Build the `MotifError` for a non-OK fal response, recognising a locked
 * account as `ACCOUNT_LOCKED`.
 */
export function falHttpError(
  status: number,
  body: string,
  requestId?: string
): MotifError {
  if (isFalAccountLocked(status, body)) {
    return new MotifError(
      `fal account is locked because it is out of credit (fal said: ${body})`,
      status,
      ACCOUNT_LOCKED,
      requestId
    );
  }
  return new MotifError(
    `Request failed: ${status} ${body}`,
    status,
    undefined,
    requestId
  );
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
