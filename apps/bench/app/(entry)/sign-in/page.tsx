import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NotAMember } from "@/components/app/gate";
import { getViewer } from "@/lib/app/auth/viewer";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Sign in",
};

const ELSEWHERE = [
  { href: "/", label: "Home" },
  { href: "/commands", label: "Commands" },
  { href: "/setup", label: "Setup" },
] as const;

function EmailForm() {
  return (
    <form action="/auth/sign-in" className="flex flex-col gap-3" method="get">
      <label className="flex flex-col gap-1.5">
        <span className="library-label text-muted">Email</span>
        <input
          autoComplete="email"
          className="board-field sign-in-field"
          inputMode="email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
      </label>
      <button className="board-button is-ink sign-in-field" type="submit">
        Continue
      </button>
      <p className="library-label text-muted">
        Use the email your invitation went to. No invitation? Ask Daniel.
      </p>
    </form>
  );
}

/** Sign in: a photograph on the left, the form on the right; on a phone the
 * photograph above and the form at the foot, in reach. When sign-in can't go
 * ahead (not set up here, no invitation), that is said in place of the form.
 * A member is sent on to their Boards. */
async function SignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ failed?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer.state === "member") {
    redirect("/boards");
  }
  const { failed } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col md:flex-row">
      <div className="sign-in-photo relative shrink-0">
        <Image
          alt=""
          className="object-cover"
          fill
          priority
          sizes="(max-width: 767px) 100vw, 53vw"
          src="/demo/looks/object.jpg"
        />
      </div>
      <div className="sign-in-form flex flex-1 flex-col px-5 pt-6 md:px-20 md:py-10">
        <Link className="app-screen-title self-start" href="/">
          Motif
        </Link>
        <p className="library-label text-muted pt-1 md:hidden">
          Motif is invitation only.
        </p>
        <div className="flex-1" />
        <div className="flex w-full flex-col gap-5 md:max-w-90">
          {viewer.state === "signed-out" ? (
            <div className="hidden flex-col gap-1 md:flex">
              <h1 className="app-screen-title">Sign in</h1>
              <p className="text-muted text-sm leading-5">
                Motif is invitation only.
              </p>
            </div>
          ) : (
            <h1 className="sr-only">Sign in</h1>
          )}
          {failed === undefined ? null : (
            <p className="type-small text-bad" role="alert">
              Sign-in didn’t finish. Try again; if it keeps failing, the link
              may have expired.
            </p>
          )}
          {viewer.state === "signed-out" ? (
            <EmailForm />
          ) : (
            <div className="sign-in-notice">
              <NotAMember viewer={viewer} />
            </div>
          )}
        </div>
        <div className="flex-1" />
        <nav aria-label="Elsewhere" className="hidden gap-5 md:flex">
          {ELSEWHERE.map((link) => (
            <Link
              className="library-label text-muted hover:text-ink"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}

export default SignInPage;
