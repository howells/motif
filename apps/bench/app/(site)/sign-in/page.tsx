import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NotAMember } from "@/components/app/gate";
import { PageHead } from "@/components/app/page-head";
import { getViewer } from "@/lib/app/auth/viewer";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Sign in",
};

/** Where sign-in lands when it can't go ahead: not set up, failed, or an
 * account with no invitation. A member is sent on to their Library. */
async function SignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ failed?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer.state === "member") {
    redirect("/library");
  }
  const { failed } = await searchParams;
  return (
    <main>
      <PageHead standfirst="The App is invitation only" title="Sign in" />
      {failed === undefined ? null : (
        <p className="type-body text-bad px-4 pt-8 md:px-10" role="alert">
          Sign-in didn’t finish. Try again; if it keeps failing, the link may
          have expired.
        </p>
      )}
      <NotAMember viewer={viewer} />
    </main>
  );
}

export default SignInPage;
