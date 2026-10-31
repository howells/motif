import { signOut } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

import { getCapabilities } from "@/lib/app/db";
import { isSameOrigin } from "@/lib/app/http/guard";

export const dynamic = "force-dynamic";

/** Sign out: POST only, from the App's own page. AuthKit clears the session
 * cookie and sends the browser to WorkOS to end the session there too. */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { code: "CROSS_ORIGIN", error: "This request didn't come from the App." },
      { status: 403 }
    );
  }
  if (!getCapabilities().signIn) {
    return NextResponse.redirect(new URL("/", origin), 303);
  }
  await signOut({ returnTo: new URL("/", origin).href });
  return NextResponse.redirect(new URL("/", origin), 303);
}
