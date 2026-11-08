import Link from "next/link";

import { Grid } from "@/components/home/grid";
import { HOME } from "@/lib/site/home/content";
import type { Link as LinkContent } from "@/lib/site/home/types";

const { chapters, masthead, wordmark } = HOME;

/** The chapters the masthead links to, in page order. */
const CHAPTER_LINKS: readonly LinkContent[] = chapters.flatMap((chapter) =>
  chapter.nav === undefined
    ? []
    : [{ href: `#${chapter.id}`, label: chapter.nav }]
);

/** The masthead's last link: Open the App for a member, Sign in for anyone
 * else. */
function Account({ member }: { readonly member: boolean }) {
  if (member) {
    return (
      <Link className="home-link home-text" href={masthead.openApp.href}>
        {masthead.openApp.label}
      </Link>
    );
  }
  return (
    <form action={masthead.signInAction} method="get">
      <button className="home-link home-text cursor-pointer" type="submit">
        {masthead.signIn}
      </button>
    </form>
  );
}

function Links({ links }: { readonly links: readonly LinkContent[] }) {
  return links.map((link) => (
    <a className="home-link home-text" href={link.href} key={link.href}>
      {link.label}
    </a>
  ));
}

/** The name on the left and the way around on the right. On desktop every
 * link is in the row; on a phone the row keeps Docs and the rest open from a
 * menu. */
export function Masthead({ member }: { readonly member: boolean }) {
  return (
    <header className="relative">
      <Grid>
        <div className="flex h-14 items-center justify-between lg:h-20">
          <Link className="home-link home-headline" href="/">
            {wordmark}
          </Link>
          <nav
            aria-label={masthead.label}
            className="hidden items-center gap-8 lg:flex"
          >
            <Links links={[...CHAPTER_LINKS, masthead.docs, masthead.github]} />
            <Account member={member} />
          </nav>
          <div className="flex items-center gap-4 lg:hidden">
            <a className="home-link home-text" href={masthead.docs.href}>
              {masthead.docs.label}
            </a>
            <details className="home-menu">
              <summary>
                <span className="sr-only">{masthead.menu}</span>
                <svg
                  aria-hidden="true"
                  height="20"
                  viewBox="0 0 20 20"
                  width="20"
                >
                  <path
                    d="M3 7 H17 M3 13 H17"
                    fill="none"
                    stroke="currentcolor"
                    strokeWidth="1.5"
                  />
                </svg>
              </summary>
              <nav aria-label={masthead.label} className="home-menu-list">
                <ul>
                  {[...CHAPTER_LINKS, masthead.github].map((link) => (
                    <li key={link.href}>
                      <a className="home-link home-text" href={link.href}>
                        {link.label}
                      </a>
                    </li>
                  ))}
                  <li>
                    <Account member={member} />
                  </li>
                </ul>
              </nav>
            </details>
          </div>
        </div>
      </Grid>
    </header>
  );
}
