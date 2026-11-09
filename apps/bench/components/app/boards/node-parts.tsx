"use client";

import { formatCost } from "@howells/motif-sdk";
import { Handle, Position } from "@xyflow/react";

import { useBoard } from "@/components/app/boards/board-context";
import { PlayIcon, StopIcon } from "@/components/app/boards/icons";
import { nodeDetail } from "@/lib/app/boards/canvas";
import type { RunState } from "@/lib/app/boards/canvas";
import { NODE_LABELS, inputOf } from "@/lib/app/boards/model";
import type { NodeViewData } from "@/lib/app/client/board-schemas";
import { formatCap, toUsd } from "@/lib/app/money";

/** The node's ports, at the middle of the frame they sit on. */
export function Ports({ node }: { readonly node: NodeViewData }) {
  const { view } = useBoard();
  const fed = view.wires.some((wire) => wire.to === node.id);
  const feeds = view.wires.some((wire) => wire.from === node.id);
  return (
    <>
      {inputOf(node.kind) === "none" ? null : (
        <Handle
          aria-label={`${NODE_LABELS[node.kind]} input`}
          className={`board-port ${fed ? "is-connected" : ""}`}
          id="in"
          position={Position.Left}
          type="target"
        />
      )}
      <Handle
        aria-label={`${NODE_LABELS[node.kind]} output`}
        className={`board-port ${feeds ? "is-connected" : ""}`}
        id="out"
        position={Position.Right}
        type="source"
      />
    </>
  );
}

/** `$0.024`, `Up to $0.50`, or `Not ready` with the reason on hover. */
function Price({ node }: { readonly node: NodeViewData }) {
  const { price } = node;
  if (price === null) {
    return null;
  }
  if (!price.ok) {
    return (
      <span className="text-muted shrink-0" title={price.reason}>
        Not ready
      </span>
    );
  }
  return (
    <span
      className="board-figure text-muted shrink-0"
      title={price.usage ? "Billed by usage" : undefined}
    >
      {price.usage
        ? `Up to ${formatCap(price.listMicros)}`
        : formatCost(toUsd(price.listMicros))}
    </span>
  );
}

/** The label row above a node: its Task, a quiet detail, Stale when it is,
 * and its price. The node itself is the image or the Prompt under it. */
export function NodeLabel({
  node,
  run,
  trailing,
}: {
  readonly node: NodeViewData;
  readonly run: RunState;
  readonly trailing?: React.ReactNode;
}) {
  const detail = nodeDetail(node, run);
  return (
    <header className="type-small mb-2 flex h-5 items-center gap-2">
      <h3 className="shrink-0 font-medium">{NODE_LABELS[node.kind]}</h3>
      {detail === null ? null : (
        <span className="text-muted min-w-0 truncate">{detail}</span>
      )}
      {node.stale && run.state === "idle" ? (
        <span className="text-warn shrink-0">Stale</span>
      ) : null}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <Price node={node} />
        {trailing}
      </span>
    </header>
  );
}

/** The bar that floats under a selected node: what it will do, its price,
 * and Run, or Stop while a run is on it. */
export function SettingsBar({
  node,
  run,
  summary,
}: {
  readonly node: NodeViewData;
  readonly run: RunState;
  readonly summary: string;
}) {
  const { openRun, stop } = useBoard();
  return (
    <div className="board-float nodrag absolute top-full left-0 mt-3 flex h-13 w-max max-w-md min-w-full items-center gap-3 pr-1 pl-4">
      <span className="type-small min-w-0 flex-1 truncate">{summary}</span>
      <span className="type-small">
        <Price node={node} />
      </span>
      {run.state === "idle" ? (
        <button
          className="board-quiet board-outline type-small hover:bg-surface gap-2 pr-3 pl-2 font-medium"
          onClick={() => {
            openRun(node.id, "node");
          }}
          type="button"
        >
          <PlayIcon />
          Run
        </button>
      ) : (
        <button
          className="board-quiet board-outline type-small hover:bg-surface gap-2 pr-3 pl-2 font-medium"
          onClick={() => {
            stop(run.run.id);
          }}
          type="button"
        >
          <StopIcon />
          Stop
        </button>
      )}
    </div>
  );
}
