import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCapabilities } from "@/lib/app/db";

export const dynamic = "force-dynamic";

/** WorkOS returns here after sign-in. AuthKit checks the state and PKCE
 * verifier, exchanges the code and seals the session cookie. Access to the
 * App is decided afterwards, on every request, from the App's own records. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!getCapabilities().signIn) {
    return NextResponse.redirect(new URL("/sign-in", origin), 303);
  }
  return await handleAuth({
    baseURL: origin,
    onError: () =>
      NextResponse.redirect(new URL("/sign-in?failed=1", origin), 303),
    returnPathname: "/library",
  })(request);
}
