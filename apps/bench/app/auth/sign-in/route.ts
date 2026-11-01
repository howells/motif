import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCapabilities } from "@/lib/app/db";

export const dynamic = "force-dynamic";

const Email = z.email().max(254);

/** Start WorkOS sign-in. AuthKit builds the authorisation URL with PKCE and
 * a sealed state; the App only names where to come back, and passes on the
 * address typed on the sign-in page so WorkOS can start from it. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  if (!getCapabilities().signIn) {
    return NextResponse.redirect(new URL("/sign-in", origin), 303);
  }
  const email = Email.safeParse(
    new URL(request.url).searchParams.get("email")?.trim()
  );
  const url = await getSignInUrl({
    redirectUri: new URL("/auth/callback", origin).href,
    ...(email.success && { loginHint: email.data }),
  });
  return NextResponse.redirect(url, 303);
}
