/**
 * Small JSON envelope shared by every route handler under `app/api/**` —
 * keeps error shape consistent so `lib/queries.ts` has exactly one place to
 * interpret a failed response, and so provider/internal error text can never
 * leak into a body by accident (every `error` string here is authored by
 * this app, never `String(caughtError)`).
 */
import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export const jsonOk = <T>(data: T, init?: ResponseInit): NextResponse<T> =>
  NextResponse.json(data, init);

export const jsonError = (
  status: number,
  code: string,
  message: string
): NextResponse<{ code: string; error: string }> =>
  NextResponse.json({ code, error: message }, { status });

export const jsonValidationError = (
  error: ZodError
): NextResponse<{ code: string; error: string; issues: unknown }> =>
  NextResponse.json(
    {
      code: "VALIDATION_ERROR",
      error: "Request body failed validation.",
      issues: error.issues,
    },
    { status: 400 }
  );
