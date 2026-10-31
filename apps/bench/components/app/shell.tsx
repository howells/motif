import Link from "next/link";
import type { ReactNode } from "react";

import { NavLinks } from "@/components/app/nav-links";
import { SpendMeter } from "@/components/app/spend-meter";
import { dmMono, facultyGlyphic } from "@/components/site/fonts";
import type { Viewer } from "@/lib/app/auth/viewer";
import { monthSummary } from "@/lib/app/budget/ledger";
import { getAppSql } from "@/lib/app/db";
import { MASTHEAD_LINKS } from "@/lib/site/content";

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

const PUBLIC_NAV: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/commands", label: "Commands" },
  { href: "/looks", label: "Looks" },
  { href: "/setup", label: "Setup" },
];

const MEMBER_NAV: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/commands", label: "Commands" },
  { href: "/looks", label: "Looks" },
  { href: "/library", label: "Library" },
  { href: "/settings", label: "Settings" },
];

const spendOf = async (viewer: Viewer) => {
  const sql = getAppSql();
  if (viewer.state !== "member" || sql === null) {
    return null;
  }
  const summary = await monthSummary(sql);
  return {
    capMicros: summary.capMicros,
    heldMicros: summary.heldMicros,
    month: summary.month,
    spentMicros: summary.spentMicros,
  };
};

/** One shell for the public site and the App: a left rail from 768px up, a
 * bottom bar below it. Signed in, Library joins the places and Settings takes
 * Setup's slot; the rail's foot carries the shared spend instead of sign-in. */
export async function Shell({
  children,
  viewer,
}: {
  readonly children: ReactNode;
  readonly viewer: Viewer;
}) {
  const member = viewer.state === "member" ? viewer.member : null;
  const items = member === null ? PUBLIC_NAV : MEMBER_NAV;
  const spend = await spendOf(viewer);

  return (
    <div className={`site app ${facultyGlyphic.variable} ${dmMono.variable}`}>
      <aside aria-label="Motif" className="app-rail">
        <Link className="app-wordmark" href="/">
          Motif
        </Link>
        <NavLinks className="app-nav" items={items} />
        <div className="mt-auto flex flex-col gap-4 px-3">
          {member === null ? (
            <>
              <form action="/auth/sign-in" className="flex" method="get">
                <button className="app-button flex-1" type="submit">
                  Sign in
                </button>
              </form>
              <nav aria-label="Elsewhere" className="flex gap-4">
                {MASTHEAD_LINKS.map((link) => (
                  <a
                    className="type-small text-muted hover:text-ink"
                    href={link.href}
                    key={link.label}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            </>
          ) : (
            <>
              {spend === null ? null : <SpendMeter spend={spend} />}
              <Link
                className="border-border flex min-h-11 items-center gap-3 border-t pt-3"
                href="/settings"
              >
                <span
                  aria-hidden="true"
                  className="bg-surface type-small flex size-7 items-center justify-center rounded-full"
                >
                  {(member.name ?? member.email).slice(0, 1).toUpperCase()}
                </span>
                <span className="type-body truncate">
                  {member.name ?? member.email}
                </span>
              </Link>
            </>
          )}
        </div>
      </aside>
      <div className="app-main">{children}</div>
      <NavLinks className="app-bar type-small" items={items} />
    </div>
  );
}
