"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useReactFlow, useViewport } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { MinusIcon, PlusIcon } from "@/components/app/boards/icons";
import { isRunning, staleRoots, staleTitle } from "@/lib/app/boards/canvas";
import { NODE_LABELS } from "@/lib/app/boards/model";
import type { NodeKind } from "@/lib/app/boards/model";
import { api, messageOf } from "@/lib/app/client/api";
import { BoardViewSchema } from "@/lib/app/client/board-schemas";
import type {
  BoardViewData,
  NodeViewData,
} from "@/lib/app/client/board-schemas";
import { formatUsd } from "@/lib/app/money";

export function ZoomControl() {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();
  return (
    <div className="board-float h-control absolute right-4 bottom-4 z-10 flex items-center">
      <button
        aria-label="Zoom out"
        className="board-quiet hover:bg-surface"
        onClick={() => {
          void zoomOut({ duration: 150 });
        }}
        type="button"
      >
        <MinusIcon />
      </button>
      <span className="type-small w-13 text-center tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <button
        aria-label="Zoom in"
        className="board-quiet hover:bg-surface"
        onClick={() => {
          void zoomIn({ duration: 150 });
        }}
        type="button"
      >
        <PlusIcon />
      </button>
      <span aria-hidden="true" className="bg-border h-5 w-px" />
      <button
        className="board-quiet type-small hover:bg-surface px-4"
        onClick={() => {
          void fitView({ duration: 200, padding: 0.2 });
        }}
        type="button"
      >
        Fit
      </button>
    </div>
  );
}

export function StaleBanner({
  onRun,
  view,
}: {
  readonly onRun: (node: NodeViewData) => void;
  readonly view: BoardViewData;
}) {
  const [root] = staleRoots(view);
  const title = staleTitle(view);
  if (root === undefined || title === null || isRunning(view)) {
    return null;
  }
  let total = 0;
  for (const node of view.nodes) {
    if (node.stale && node.price?.ok === true) {
      total += node.price.listMicros;
    }
  }
  return (
    <div className="board-float board-banner absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 py-2 pr-2 pl-4">
      <span aria-hidden="true" className="board-stale-dot" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="type-body font-medium">{title}</span>
        <span className="type-small text-muted">
          Something upstream changed. Nothing is spent until you run them.
        </span>
      </span>
      <button
        className="board-button shrink-0"
        onClick={() => {
          onRun(root);
        }}
        type="button"
      >
        Run from {NODE_LABELS[root.kind]}
        {total > 0 ? (
          <span className="board-figure">{formatUsd(total)}</span>
        ) : null}
      </button>
    </div>
  );
}

const STARTERS: readonly { kind: NodeKind; text: string }[] = [
  { kind: "prompt", text: "Write what you want to see" },
  { kind: "source", text: "Drop a photo or choose from your Library" },
  { kind: "compare", text: "One prompt on several Models" },
];

export function EmptyBoard({
  onStart,
}: {
  readonly onStart: (kind: NodeKind) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6">
      <p className="text-muted type-body">Start with</p>
      <div className="pointer-events-auto flex flex-wrap justify-center gap-3">
        {STARTERS.map((starter) => (
          <button
            className="board-card board-starter flex w-52 flex-col items-start gap-1 p-4 text-left"
            key={starter.kind}
            onClick={() => {
              onStart(starter.kind);
            }}
            type="button"
          >
            <span className="type-body font-medium">
              {NODE_LABELS[starter.kind]}
            </span>
            <span className="type-small text-muted">{starter.text}</span>
          </button>
        ))}
      </div>
      <p className="type-small text-muted">
        Every other Task is under Add node
      </p>
    </div>
  );
}

export function BoardName({
  board,
}: {
  readonly board: BoardViewData["board"];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  if (board.kind === "inbox") {
    return <h1 className="type-title truncate">{board.name}</h1>;
  }
  if (!editing) {
    return (
      <h1 className="type-title min-w-0">
        <button
          className="hover:bg-surface rounded-panel -mx-2 max-w-full truncate px-2 py-1"
          onClick={() => {
            setEditing(true);
          }}
          title="Rename"
          type="button"
        >
          {board.name}
        </button>
        {problem === null ? null : (
          <span className="type-small text-bad ml-3">{problem}</span>
        )}
      </h1>
    );
  }
  const save = async (name: string) => {
    setEditing(false);
    if (name.trim() === "" || name.trim() === board.name) {
      return;
    }
    try {
      const next = await api(`/api/app/boards/${board.id}`, BoardViewSchema, {
        body: { name: name.trim() },
        method: "PATCH",
      });
      queryClient.setQueryData(["board", board.id], next);
      router.refresh();
    } catch (error) {
      setProblem(messageOf(error));
    }
  };
  return (
    <form
      className="flex min-w-0 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save(field.current?.value ?? "");
      }}
    >
      <input
        aria-label="Board name"
        autoFocus
        className="type-title board-field h-10 min-h-0 w-72 py-0"
        defaultValue={board.name}
        maxLength={80}
        name="name"
        ref={field}
        onBlur={(event) => {
          void save(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setEditing(false);
          }
        }}
      />
      {problem === null ? null : (
        <span className="type-small text-bad">{problem}</span>
      )}
    </form>
  );
}

/** A Board: the top bar, the canvas and the selected node's panel. */
