import Link from "next/link";
import type { ReactNode } from "react";

import { BoardRail } from "@/components/app/boards/board-rail";
import type { RailBoard } from "@/components/app/boards/board-rail";
import { NavLinks } from "@/components/app/nav-links";
import { SpendMeter } from "@/components/app/spend-meter";
import { dmMono, facultyGlyphic } from "@/components/site/fonts";
import type { Viewer } from "@/lib/app/auth/viewer";
import { ensureInbox, listBoards } from "@/lib/app/boards/store";
import { monthSummary, spendFor } from "@/lib/app/budget/ledger";
import { SpendSchema } from "@/lib/app/client/schemas";
import type { SpendData } from "@/lib/app/client/schemas";
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

/** On a phone the App is Make and Library; Boards need the room a larger
 * screen gives them. */
const MEMBER_BAR: readonly NavItem[] = [
  { href: "/make", label: "Make" },
  { href: "/library", label: "Library" },
];

const spendOf = async (viewer: Viewer): Promise<SpendData | null> => {
  const sql = getAppSql();
  if (viewer.state !== "member" || sql === null) {
    return null;
  }
  // Checked against the shape the meter reads, as an API reply would be.
  return SpendSchema.parse(spendFor(await monthSummary(sql), viewer.member));
};

const boardsOf = async (viewer: Viewer): Promise<readonly RailBoard[]> => {
  const sql = getAppSql();
  if (viewer.state !== "member" || sql === null) {
    return [];
  }
  await ensureInbox(sql, viewer.member.id);
  const boards = await listBoards(sql, viewer.member.id);
  return boards.map((board) => ({
    id: board.id,
    images: board.images,
    kind: board.kind,
    name: board.name,
  }));
};

/** One shell for the public site and the App: a left rail from 768px up, a
 * bottom bar below it. Signed in, the rail is the member's Boards, Library
 * and Settings, with your own spend and the account at its foot; the
 * phone's bar is Make and Library. */
export async function Shell({
  children,
  viewer,
}: {
  readonly children: ReactNode;
  readonly viewer: Viewer;
}) {
  const member = viewer.state === "member" ? viewer.member : null;
  const [spend, boards] = await Promise.all([
    spendOf(viewer),
    boardsOf(viewer),
  ]);

  return (
    <div className={`site app ${facultyGlyphic.variable} ${dmMono.variable}`}>
      <aside aria-label="Motif" className="app-rail">
        <Link className="app-wordmark" href="/">
          Motif
        </Link>
        {member === null ? (
          <NavLinks className="app-nav" items={PUBLIC_NAV} />
        ) : (
          <BoardRail boards={boards} />
        )}
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
              {spend === null ? null : <SpendMeter initial={spend} />}
              <Link
                className="border-border min-h-control flex items-center gap-3 border-t pt-3"
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
      <NavLinks
        className="app-bar type-small"
        items={member === null ? PUBLIC_NAV : MEMBER_BAR}
      />
    </div>
  );
}
