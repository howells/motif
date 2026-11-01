/**
 * Shared parsing for the Board routes: a JSON body checked against a schema,
 * and an `Outcome` turned into a response.
 */
import type { z } from "zod";

import { appError, readJson } from "../http/guard";
import type { Outcome } from "./service";

export const parseBody = async <T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly response: Response }
> => {
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return {
      ok: false,
      response: appError(400, "INVALID_JSON", "Send the request as JSON."),
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      response: appError(
        400,
        "INVALID_REQUEST",
        `${issue?.message ?? "That request isn't valid."}${
          issue === undefined || issue.path.length === 0
            ? ""
            : ` (${issue.path.join(".")})`
        }`
      ),
    };
  }
  return { ok: true, value: parsed.data };
};

export const respond = <T>(outcome: Outcome<T>, status = 200): Response =>
  outcome.ok
    ? Response.json(outcome.value, { status })
    : appError(outcome.status, outcome.code, outcome.message, outcome.details);
