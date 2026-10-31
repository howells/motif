import { withAuth } from "@workos-inc/authkit-nextjs";
import { cache } from "react";

import { getAppSql, getCapabilities } from "../db";
import { resolveAccess } from "./members";
import type { Member } from "./members";

/**
 * Who is looking at a page, decided on the server for each request.
 *
 * Every state is real: there is no development bypass and no stand-in
 * session. Without WorkOS credentials the App says sign-in isn't set up;
 * without a database it says the App isn't available, even to someone
 * WorkOS has signed in.
 */
export type Viewer =
  | { readonly state: "sign-in-unavailable" }
  | { readonly state: "signed-out" }
  | { readonly state: "app-unavailable"; readonly email: string }
  | {
      readonly state: "no-access";
      readonly email: string;
      readonly revoked: boolean;
    }
  | {
      readonly state: "member";
      readonly email: string;
      readonly member: Member;
    };

/** The signed-in WorkOS user, or `null`. Only called when sign-in is set up,
 * because AuthKit's proxy must have run for `withAuth` to read the session. */
const signedInUser = async () => {
  const { user } = await withAuth();
  return user;
};

export const getViewer = cache(async (): Promise<Viewer> => {
  if (!getCapabilities().signIn) {
    return { state: "sign-in-unavailable" };
  }
  const user = await signedInUser();
  if (user === null) {
    return { state: "signed-out" };
  }
  const sql = getAppSql();
  if (sql === null) {
    return { email: user.email, state: "app-unavailable" };
  }
  const access = await resolveAccess(sql, {
    email: user.email,
    emailVerified: user.emailVerified,
    name:
      user.name ??
      ([user.firstName, user.lastName].filter(Boolean).join(" ") || null),
    workosUserId: user.id,
  });
  if (access.kind === "member") {
    return { email: user.email, member: access.member, state: "member" };
  }
  return {
    email: user.email,
    revoked: access.kind === "revoked",
    state: "no-access",
  };
});
