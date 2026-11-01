"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { PlusIcon } from "@/components/app/boards/icons";
import { api, messageOf } from "@/lib/app/client/api";
import { NewBoardReply } from "@/lib/app/client/board-schemas";

export interface RailBoard {
  readonly id: string;
  readonly images: number;
  readonly kind: "board" | "inbox";
  readonly name: string;
}

const row =
  "flex min-h-11 items-center gap-2 rounded px-3 type-body text-muted hover:text-ink aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:text-ink";

/** The member's places: Boards with the Inbox first, then Library and
 * Settings. A new Board is named "Untitled Board" and renamed in place. */
export function BoardRail({
  boards,
}: {
  readonly boards: readonly RailBoard[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inbox = boards.find((board) => board.kind === "inbox");
  const named = boards.filter((board) => board.kind === "board");
  const current = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined;

  const create = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const reply = await api("/api/app/boards", NewBoardReply, {
        body: { name: "Untitled Board" },
      });
      router.push(`/boards/${reply.board.id}`);
      router.refresh();
    } catch (error) {
      setProblem(messageOf(error));
    }
    setBusy(false);
  };

  return (
    <nav aria-label="Places" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between pl-3">
        <h2 className="type-small text-muted">Boards</h2>
        <button
          aria-label="New Board"
          className="board-quiet text-muted hover:bg-surface hover:text-ink"
          disabled={busy}
          onClick={() => {
            void create();
          }}
          type="button"
        >
          <PlusIcon />
        </button>
      </div>
      {problem === null ? null : (
        <p className="type-small text-bad px-3 pb-2" role="alert">
          {problem}
        </p>
      )}
      <ul className="flex min-h-0 flex-col overflow-y-auto">
        {inbox === undefined ? null : (
          <li>
            <Link
              aria-current={current(`/boards/${inbox.id}`)}
              className={row}
              href={`/boards/${inbox.id}`}
            >
              <span className="flex-1 truncate">Inbox</span>
              {inbox.images === 0 ? null : (
                <span className="type-small w-6 text-right tabular-nums">
                  {inbox.images}
                </span>
              )}
            </Link>
          </li>
        )}
        {named.map((board) => (
          <li key={board.id}>
            <Link
              aria-current={current(`/boards/${board.id}`)}
              className={row}
              href={`/boards/${board.id}`}
            >
              <span className="truncate">{board.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <ul className="board-rule-top mt-3 flex flex-col pt-3">
        <li>
          <Link
            aria-current={current("/library")}
            className={row}
            href="/library"
          >
            Library
          </Link>
        </li>
        <li>
          <Link
            aria-current={current("/settings")}
            className={row}
            href="/settings"
          >
            Settings
          </Link>
        </li>
      </ul>
    </nav>
  );
}
