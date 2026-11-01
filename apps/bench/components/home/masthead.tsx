import Link from "next/link";

import { MASTHEAD_LINKS, SITE } from "@/lib/site/content";

const link =
  "type-body min-h-control inline-flex items-center text-ink no-underline hover:underline";

const github = MASTHEAD_LINKS.find((item) => item.label === "GitHub");

/** The install line on the left, where a reader looks for it, and three
 * places to go on the right. There is no app rail on the homepage. On a phone
 * the install line leaves, because the hand-off repeats it with a Copy. */
export function HomeMasthead({ member }: { readonly member: boolean }) {
  return (
    <header className="home-gutter flex items-center justify-end md:h-16 md:justify-between">
      <code className="type-small text-muted hidden font-mono md:block">
        {SITE.install}
      </code>
      <nav aria-label="Motif" className="flex gap-6 md:gap-8">
        <Link className={link} href="/docs" prefetch={false}>
          Docs
        </Link>
        {github === undefined ? null : (
          <a className={link} href={github.href}>
            {github.label}
          </a>
        )}
        {member ? (
          <Link className={link} href="/make">
            Open the App
          </Link>
        ) : (
          <form action="/auth/sign-in" method="get">
            <button className={`${link} cursor-pointer`} type="submit">
              Sign in
            </button>
          </form>
        )}
      </nav>
    </header>
  );
}
