"use client";

import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SearchIcon } from "@/components/app/boards/icons";
import { LibraryPanel } from "@/components/app/library/library-panel";
import { MediaImage } from "@/components/app/media-image";
import { api, messageOf } from "@/lib/app/client/api";
import { BoardsReply } from "@/lib/app/client/board-schemas";
import { dayName } from "@/lib/app/client/dates";
import { StacksReply } from "@/lib/app/client/schemas";
import { formatUsd } from "@/lib/app/money";
import type { StackView } from "@/lib/app/views";
import { APP_TASK_IDS, taskTitle } from "@/lib/site/commands";

interface Day {
  readonly costMicros: number;
  readonly name: string;
  readonly stacks: readonly StackView[];
}

const byDay = (stacks: readonly StackView[]): Day[] => {
  const days: { costMicros: number; name: string; stacks: StackView[] }[] = [];
  for (const stack of stacks) {
    const name = dayName(stack.completedAt);
    const last = days.at(-1);
    if (last?.name === name) {
      last.stacks.push(stack);
      last.costMicros += stack.costMicros;
    } else {
      days.push({ costMicros: stack.costMicros, name, stacks: [stack] });
    }
  }
  return days;
};

/** "Erase", "Generate · Pick", "Compare · Pick". */
const captionOf = (stack: StackView): string => {
  const made = stack.comparisonId === null ? taskTitle(stack.task) : "Compare";
  return stack.picked ? `${made} · Pick` : made;
};

interface Filters {
  readonly board: string;
  readonly search: string;
  readonly task: string;
}

const libraryPath = (filters: Filters): string => {
  const params = new URLSearchParams();
  const fields: readonly (readonly [string, string])[] = [
    ["q", filters.search.trim()],
    ["board", filters.board],
    ["task", filters.task],
  ];
  for (const [name, value] of fields) {
    if (value !== "") {
      params.set(name, value);
    }
  }
  return `/api/app/library?${params.toString()}`;
};

function Tile({
  onOpen,
  open,
  stack,
}: {
  readonly onOpen: () => void;
  readonly open: boolean;
  readonly stack: StackView;
}) {
  return (
    <li className="flex flex-col gap-2">
      <button
        aria-label={stack.prompt ?? captionOf(stack)}
        aria-pressed={open}
        className={`library-tile bg-surface aspect-square w-full md:rounded ${open ? "is-open" : ""}`}
        onClick={onOpen}
        type="button"
      >
        {stack.cover === null ? null : (
          <MediaImage
            alt=""
            sizes="(max-width: 767px) 33vw, 202px"
            src={stack.cover.url}
          />
        )}
        {stack.versions > 1 ? (
          <span className="bg-plate/80 text-plate-ink type-small absolute top-1.5 right-1.5 flex items-center gap-1 rounded-sm px-1.5">
            <Layers aria-hidden="true" size={12} strokeWidth={1.5} />
            {stack.versions}
          </span>
        ) : null}
      </button>
      <span className="hidden flex-col md:flex">
        <span className="text-sm leading-5 font-medium">
          {captionOf(stack)}
        </span>
        <span className="library-label text-muted truncate">
          {stack.board?.name ?? "No Board"}
        </span>
      </span>
    </li>
  );
}

function FilterBar({
  boards,
  filters,
  onChange,
}: {
  readonly boards: readonly { readonly id: string; readonly name: string }[];
  readonly filters: Filters;
  readonly onChange: (next: Filters) => void;
}) {
  return (
    <div className="flex gap-2 px-5 pt-1 pb-4 md:px-6 md:pt-3">
      <label className="board-field flex min-w-0 flex-1 items-center gap-2 py-0 md:w-65 md:flex-none">
        <SearchIcon className="text-muted shrink-0" />
        <input
          aria-label="Search prompts"
          className="placeholder:text-faint min-w-0 flex-1 bg-transparent outline-none"
          onChange={(event) => {
            onChange({ ...filters, search: event.target.value });
          }}
          placeholder="Search prompts"
          type="search"
          value={filters.search}
        />
      </label>
      <select
        aria-label="Board"
        className="board-field w-auto shrink-0"
        onChange={(event) => {
          onChange({ ...filters, board: event.target.value });
        }}
        value={filters.board}
      >
        <option value="">All Boards</option>
        {boards.map((board) => (
          <option key={board.id} value={board.id}>
            {board.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Task"
        className="board-field hidden w-auto shrink-0 md:block"
        onChange={(event) => {
          onChange({ ...filters, task: event.target.value });
        }}
        value={filters.task}
      >
        <option value="">Every Task</option>
        {APP_TASK_IDS.map((task) => (
          <option key={task} value={task}>
            {taskTitle(task)}
          </option>
        ))}
      </select>
    </div>
  );
}

function Empty({ filters }: { readonly filters: Filters }) {
  const searching = filters.search.trim() !== "";
  if (searching || filters.board !== "" || filters.task !== "") {
    return (
      <p className="type-body py-10">
        {searching
          ? `No prompt matches “${filters.search.trim()}”.`
          : "Nothing made here yet."}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <p className="type-body">Nothing here yet.</p>
      <Link className="board-button is-ink px-4" href="/make">
        Make an image
      </Link>
    </div>
  );
}

function Days({
  days,
  onOpen,
  openId,
}: {
  readonly days: readonly Day[];
  readonly onOpen: (stack: StackView) => void;
  readonly openId: string | null;
}) {
  return days.map((day) => (
    <section className="pb-4 md:pb-5" key={day.name}>
      <h2 className="flex h-10 items-center justify-between px-5 md:h-8 md:px-0">
        <span className="text-sm leading-5 font-medium">{day.name}</span>
        <span className="board-mono text-muted">
          {formatUsd(day.costMicros)}
        </span>
      </h2>
      <ul className="grid grid-cols-3 gap-0.5 md:grid-cols-[repeat(auto-fill,minmax(10rem,202px))] md:gap-x-4 md:gap-y-5">
        {day.stacks.map((stack) => (
          <Tile
            key={stack.stackId}
            onOpen={() => {
              onOpen(stack);
            }}
            open={openId === stack.stackId}
            stack={stack}
          />
        ))}
      </ul>
    </section>
  ));
}

/** One person's Library: every image, latest first, grouped by day with
 * what the day cost. Opening one shows it on the plate. */
export function LibraryView() {
  const [filters, setFilters] = useState<Filters>({
    board: "",
    search: "",
    task: "",
  });
  const [open, setOpen] = useState<StackView | null>(null);
  const boards = useQuery({
    queryFn: async () => await api("/api/app/boards", BoardsReply),
    queryKey: ["boards"],
  });
  const library = useQuery({
    queryFn: async () => await api(libraryPath(filters), StacksReply),
    queryKey: ["library", filters.board, filters.task, filters.search.trim()],
  });
  const boardList = boards.data?.boards ?? [];
  const inboxId = boardList.find((board) => board.kind === "inbox")?.id ?? null;

  return (
    <div className="flex min-h-dvh">
      <main className="min-w-0 flex-1">
        <header className="library-head flex items-center gap-4 px-5 md:px-6">
          <h1 className="library-title">Library</h1>
          {library.data === undefined ? null : (
            <span className="library-label text-muted hidden md:inline">
              {library.data.images === 1
                ? "1 image"
                : `${library.data.images} images`}
            </span>
          )}
        </header>
        <FilterBar boards={boardList} filters={filters} onChange={setFilters} />
        <div className="pb-10 md:px-6">
          {library.isPending ? (
            <p className="type-small text-muted px-5 py-6 md:px-0">
              Loading your Library…
            </p>
          ) : library.isError ? (
            <p className="type-small text-bad px-5 py-6 md:px-0" role="alert">
              {messageOf(library.error)}
            </p>
          ) : library.data.stacks.length === 0 ? (
            <div className="px-5 md:px-0">
              <Empty filters={filters} />
            </div>
          ) : (
            <Days
              days={byDay(library.data.stacks)}
              onOpen={setOpen}
              openId={open?.stackId ?? null}
            />
          )}
        </div>
      </main>
      {open === null ? null : (
        <LibraryPanel
          inboxId={inboxId}
          key={open.stackId}
          onClose={() => {
            setOpen(null);
          }}
          stack={open}
        />
      )}
    </div>
  );
}
