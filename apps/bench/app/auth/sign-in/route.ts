import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

import { getCapabilities } from "@/lib/app/db";

export const dynamic = "force-dynamic";

/** Start WorkOS sign-in. AuthKit builds the authorisation URL with PKCE and
 * a sealed state; the App only names where to come back. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  if (!getCapabilities().signIn) {
    return NextResponse.redirect(new URL("/sign-in", origin), 303);
  }
  const url = await getSignInUrl({
    redirectUri: new URL("/auth/callback", origin).href,
  });
  return NextResponse.redirect(url, 303);
}
