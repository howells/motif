"use client";

import type { NodeProps } from "@xyflow/react";

import { useBoard } from "@/components/app/boards/board-context";
import { CompareCard } from "@/components/app/boards/compare-card";
import { NodeImage } from "@/components/app/boards/node-image";
import {
  NodeLabel,
  Ports,
  SettingsBar,
} from "@/components/app/boards/node-parts";
import {
  NODE_WIDTH,
  promptLine,
  runStateOf,
  settingsLine,
} from "@/lib/app/boards/canvas";
import type { NodeViewOf } from "@/lib/app/boards/canvas";
import { isRunnable } from "@/lib/app/boards/model";

/** A Prompt: its words on a paper slip, the Look and Mood beneath. */
function PromptSlip({
  node,
  selected,
}: {
  readonly node: NodeViewOf<"prompt">;
  readonly selected: boolean;
}) {
  const { words } = useBoard();
  const text = node.settings.text.trim();
  const line = promptLine(node, words);
  return (
    <div
      className={`board-frame board-slip relative flex flex-col gap-2 p-4 ${selected ? "is-selected" : ""}`}
    >
      <Ports node={node} />
      <p
        className={`type-body line-clamp-5 ${text === "" ? "text-faint" : ""}`}
      >
        {text === "" ? "Write what you want to see" : text}
      </p>
      {line === null ? null : (
        <p className="type-small text-muted truncate">{line}</p>
      )}
    </div>
  );
}

/** One node on the canvas, drawn for its kind: a label row above, and the
 * image, the Prompt or the Compare row as the node itself. */
export function NodeCard({ id, selected }: NodeProps) {
  const { view, words } = useBoard();
  const node = view.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) {
    return null;
  }
  const run = runStateOf(view, node);
  if (node.kind === "compare") {
    return <CompareCard node={node} run={run} selected={selected} />;
  }
  return (
    <div className="relative" style={{ inlineSize: NODE_WIDTH[node.kind] }}>
      <NodeLabel node={node} run={run} />
      {node.kind === "prompt" ? (
        <PromptSlip node={node} selected={selected} />
      ) : (
        <NodeImage node={node} run={run} selected={selected} />
      )}
      {selected && isRunnable(node.kind) ? (
        <SettingsBar
          node={node}
          run={run}
          summary={settingsLine(node, words)}
        />
      ) : null}
    </div>
  );
}
