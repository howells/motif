"use client";

import { useEffect, useRef, useState } from "react";

import { SearchIcon } from "@/components/app/boards/icons";
import { NODE_LABELS } from "@/lib/app/boards/model";
import type { NodeKind } from "@/lib/app/boards/model";

interface Entry {
  readonly kind: NodeKind;
  readonly description: string;
}

interface Group {
  readonly name: string;
  readonly entries: readonly Entry[];
}

/** Only nodes that run in the App: every Task here can hold a price. */
const NODE_GROUPS: readonly Group[] = [
  {
    entries: [
      { description: "Text in, for Generate or Compare", kind: "prompt" },
      { description: "Your photo or a Library image", kind: "source" },
      { description: "Make an image from a prompt", kind: "generate" },
      { description: "Variations of an image you have", kind: "vary" },
      { description: "One prompt across several Models", kind: "compare" },
    ],
    name: "Make",
  },
  {
    entries: [
      { description: "Remove a thing and fill the gap", kind: "erase" },
      { description: "Extend to a new aspect ratio", kind: "reframe" },
      { description: "Remove the background", kind: "cutout" },
    ],
    name: "Edit",
  },
  {
    entries: [
      { description: "Larger, without losing detail", kind: "upscale" },
    ],
    name: "Upscale and finish",
  },
];

const matches = (entry: Entry, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  return (
    needle === "" ||
    NODE_LABELS[entry.kind].toLowerCase().includes(needle) ||
    entry.description.toLowerCase().includes(needle)
  );
};

/** Find a Task by name and add it to the Board. Opens with ⌘K. */
export function AddNode({
  onAdd,
  onClose,
}: {
  readonly onAdd: (kind: NodeKind) => void;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) {
      element.showModal();
    }
  }, []);

  const groups = NODE_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => matches(entry, query)),
  })).filter((group) => group.entries.length > 0);
  const flat = groups.flatMap((group) => group.entries);
  const current = Math.min(active, Math.max(flat.length - 1, 0));
  const left = groups.filter((group) => group.name === "Make");
  const right = groups.filter((group) => group.name !== "Make");

  const column = (list: typeof groups) =>
    list.map((group) => (
      <section aria-label={group.name} key={group.name}>
        <h3 className="type-small text-muted flex h-8 items-end px-3 pb-1.5">
          {group.name}
        </h3>
        <ul>
          {group.entries.map((entry) => {
            const index = flat.indexOf(entry);
            return (
              <li key={entry.kind}>
                <button
                  className={`flex h-11 w-full items-center gap-3 rounded px-3 text-left ${index === current ? "bg-surface" : ""}`}
                  onClick={() => {
                    onAdd(entry.kind);
                  }}
                  onPointerMove={() => {
                    setActive(index);
                  }}
                  type="button"
                >
                  <span className="type-body w-21 shrink-0 font-medium">
                    {NODE_LABELS[entry.kind]}
                  </span>
                  <span className="type-small text-muted line-clamp-1">
                    {entry.description}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    ));

  return (
    <dialog
      aria-label="Add node"
      className="board-dialog board-palette mx-auto mt-18 w-[728px] max-w-[calc(100vw-2rem)]"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialog}
    >
      <div className="board-rule-bottom flex h-14 items-center gap-2.5 px-4">
        <SearchIcon className="text-muted shrink-0" />
        <input
          aria-label="Find a Task"
          autoFocus
          className="placeholder:text-faint type-body min-w-0 flex-1 bg-transparent outline-none"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current + 1) % Math.max(flat.length, 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current - 1 + flat.length) % Math.max(flat.length, 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const entry = flat[current];
              if (entry !== undefined) {
                onAdd(entry.kind);
              }
            }
          }}
          placeholder="Find a Task"
          value={query}
        />
        <kbd className="type-small text-muted">Esc</kbd>
      </div>
      {flat.length === 0 ? (
        <p className="type-small text-muted px-7 py-6">
          No Task called “{query.trim()}”. Every Task the App can run is listed
          here.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2">
          <div>{column(left)}</div>
          <div>{column(right)}</div>
        </div>
      )}
    </dialog>
  );
}
