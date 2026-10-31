import { getAppCredentials } from "@motif/bench-env/runtime";
import { authkitProxy } from "@workos-inc/authkit-nextjs";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Keeps the WorkOS session fresh and makes it readable to the pages and
 * routes behind it. It decides nothing about access: every App route and
 * page checks sign-in and membership itself, against the database.
 *
 * Without WorkOS credentials there is no session to refresh, so requests
 * pass straight through and the App shows that sign-in isn't set up.
 */
export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent
) {
  if (getAppCredentials().workos === null) {
    return NextResponse.next();
  }
  const redirectUri = new URL("/auth/callback", request.nextUrl.origin).href;
  return await authkitProxy({ redirectUri })(request, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon|icon|apple-icon|pwa-icon|manifest|opengraph-image|robots.txt|sitemap.xml|site/|.*\\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$).*)",
  ],
};
