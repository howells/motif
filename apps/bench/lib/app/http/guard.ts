import type { AppSql } from "@motif/bench-db/app-sql";
import { NextResponse } from "next/server";

import type { Member } from "../auth/members";
import { getViewer } from "../auth/viewer";
import { getAppSql } from "../db";

/** A JSON error the App's client reads: a stable code and a sentence. */
export const appError = (
  status: number,
  code: string,
  message: string,
  extra?: object
) => NextResponse.json({ code, error: message, ...extra }, { status });

/**
 * Whether a state-changing request came from this App's own pages.
 *
 * Browsers send `Origin` on every cross-origin request and on same-origin
 * POSTs; where it is absent, `Sec-Fetch-Site` says where the request came
 * from. A request with neither is refused. AuthKit's session cookie is
 * SameSite=Lax, and this is the second lock behind it.
 */
export const isSameOrigin = (request: Request): boolean => {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== null) {
    return origin === expected;
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
};

export type Authorised =
  | { readonly ok: true; readonly member: Member; readonly sql: AppSql }
  | { readonly ok: false; readonly response: Response };

/**
 * The server boundary for every App route that spends, returns private data
 * or changes access. Checks origin for writes, then sign-in, then live
 * membership in the database (so a revoked member is refused at once), then
 * the owner role where asked.
 */
export const authorise = async (
  request: Request,
  options: { readonly write?: boolean; readonly owner?: boolean } = {}
): Promise<Authorised> => {
  if (options.write === true && !isSameOrigin(request)) {
    return {
      ok: false,
      response: appError(
        403,
        "CROSS_ORIGIN",
        "This request didn't come from the App."
      ),
    };
  }
  const viewer = await getViewer();
  switch (viewer.state) {
    case "sign-in-unavailable": {
      return {
        ok: false,
        response: appError(
          503,
          "SIGN_IN_UNAVAILABLE",
          "Sign-in isn't set up on this server."
        ),
      };
    }
    case "signed-out": {
      return {
        ok: false,
        response: appError(401, "SIGNED_OUT", "Sign in to use the App."),
      };
    }
    case "app-unavailable": {
      return {
        ok: false,
        response: appError(
          503,
          "APP_UNAVAILABLE",
          "The App's database isn't set up on this server."
        ),
      };
    }
    case "no-access": {
      return {
        ok: false,
        response: appError(
          403,
          "NO_ACCESS",
          "This account hasn't been invited to the App."
        ),
      };
    }
    case "member": {
      if (options.owner === true && viewer.member.role !== "owner") {
        return {
          ok: false,
          response: appError(403, "OWNER_ONLY", "Only the owner can do this."),
        };
      }
      const sql = getAppSql();
      if (sql === null) {
        return {
          ok: false,
          response: appError(
            503,
            "APP_UNAVAILABLE",
            "The App's database isn't set up on this server."
          ),
        };
      }
      return { member: viewer.member, ok: true, sql };
    }
    default: {
      return {
        ok: false,
        response: appError(500, "UNKNOWN_VIEWER", "Unknown sign-in state."),
      };
    }
  }
};

/** Parse a JSON body, refusing anything not declared as JSON so a plain
 * cross-site form post can't reach a handler. */
export const readJson = async (request: Request): Promise<unknown> => {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new TypeError("Expected a JSON body.");
  }
  return await request.json();
};
