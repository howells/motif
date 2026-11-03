"use client";

import { useState } from "react";

import { useBoard } from "@/components/app/boards/board-context";
import { CheckIcon, ChevronDownIcon } from "@/components/app/boards/icons";
import {
  NodeLabel,
  Ports,
  SettingsBar,
} from "@/components/app/boards/node-parts";
import { LiveBeats, LiveGlow } from "@/components/app/boards/process";
import { MediaImage } from "@/components/app/media-image";
import { modelsOf, nodeWidth, settingsLine } from "@/lib/app/boards/canvas";
import type { RunState } from "@/lib/app/boards/canvas";
import type {
  NodeViewData,
  ResultViewData,
} from "@/lib/app/client/board-schemas";
import { formatSeconds, formatUsd } from "@/lib/app/money";

/** `$0.030 · 15 s`, as much of it as is known. */
const columnFacts = (result: ResultViewData | undefined): string => {
  const facts: string[] = [];
  if (result?.costMicros !== undefined && result.costMicros !== null) {
    facts.push(
      result.costEstimated
        ? `About ${formatUsd(result.costMicros)}`
        : formatUsd(result.costMicros)
    );
  }
  if (result?.elapsedMs !== undefined && result.elapsedMs !== null) {
    facts.push(formatSeconds(result.elapsedMs));
  }
  return facts.join(" · ");
};

const latestPerModel = (
  node: NodeViewData
): ReadonlyMap<string, ResultViewData> => {
  const latest = new Map<string, ResultViewData>();
  for (const result of node.results) {
    if (!latest.has(result.model)) {
      latest.set(result.model, result);
    }
  }
  return latest;
};

const wellNote = (result: ResultViewData | undefined): string => {
  if (result === undefined) {
    return "Not run yet";
  }
  if (result.status === "failed") {
    return result.error ?? "This Model failed.";
  }
  return result.status === "completed" ? "Not run yet" : "Making";
};

function CompareColumn({
  model,
  node,
  result,
}: {
  readonly model: string;
  readonly node: NodeViewData;
  readonly result: ResultViewData | undefined;
}) {
  const { makePick } = useBoard();
  const output = result?.outputs[0];
  const picked = output !== undefined && output.assetId === node.pick?.assetId;
  const failed = result?.status === "failed";
  return (
    <div className="flex w-68 flex-col gap-2">
      <div
        className={`board-frame relative size-68 overflow-hidden ${output === undefined ? "is-empty" : ""} ${picked ? "is-picked" : ""}`}
      >
        {output === undefined ? (
          <span
            className={`type-small absolute inset-0 flex items-center justify-center px-6 text-center ${failed ? "text-bad" : "text-faint"}`}
          >
            {wellNote(result)}
          </span>
        ) : (
          <div
            className={`absolute inset-0 ${node.stale ? "board-image" : ""}`}
          >
            <MediaImage
              alt={node.names[model] ?? model}
              sizes="272px"
              src={output.url}
            />
          </div>
        )}
        {picked ? (
          <span className="board-chip type-small absolute bottom-2 left-2">
            <CheckIcon size={14} />
            Pick
          </span>
        ) : null}
      </div>
      <div className="min-h-control flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="type-small truncate">
            {node.names[model] ?? result?.modelName ?? model}
          </span>
          <span className="board-figure type-small text-muted">
            {columnFacts(result)}
          </span>
        </div>
        {output === undefined || picked ? null : (
          <button
            className="board-quiet board-outline nodrag type-small hover:bg-surface shrink-0 px-3"
            onClick={() => {
              makePick(node, output.assetId);
            }}
            type="button"
          >
            Make Pick
          </button>
        )}
      </div>
    </div>
  );
}

const fastestOf = (node: NodeViewData): ResultViewData | null => {
  const done = [...latestPerModel(node).values()].filter(
    (result) => result.status === "completed" && result.elapsedMs !== null
  );
  return (
    done.toSorted((a, b) => (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0))[0] ?? null
  );
};

/** A Compare node: one image per Model side by side on the ground, each
 * named under it, the Pick marked. */
export function CompareCard({
  node,
  run,
  selected,
}: {
  readonly node: NodeViewData;
  readonly run: RunState;
  readonly selected: boolean;
}) {
  const { now, process, words } = useBoard();
  const [open, setOpen] = useState(true);
  const fastest = fastestOf(node);
  const live = process(node.id);
  const models = modelsOf(node);
  const latest = latestPerModel(node);
  const summary = [
    settingsLine(node, words),
    fastest === null
      ? null
      : `Fastest: ${fastest.modelName}, ${formatSeconds(fastest.elapsedMs ?? 0)}`,
  ]
    .filter((part) => part !== null)
    .join(" · ");
  return (
    <div
      className="relative"
      style={{ inlineSize: nodeWidth("compare", node) }}
    >
      <NodeLabel
        node={node}
        run={run}
        trailing={
          <button
            aria-expanded={open}
            aria-label={open ? "Fold the results away" : "Show the results"}
            className="board-fold nodrag"
            onClick={() => {
              setOpen(!open);
            }}
            type="button"
          >
            <ChevronDownIcon className={open ? "" : "-rotate-90"} size={16} />
          </button>
        }
      />
      <div className={`board-group relative ${selected ? "is-selected" : ""}`}>
        <Ports node={node} />
        {live.live && live.beats.length > 0 ? (
          <div className="board-frame board-live relative mb-4 h-40 overflow-hidden">
            <LiveGlow />
            <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
              <LiveBeats
                beats={live.beats}
                now={now}
                origin={live.origin ?? now}
              />
            </div>
          </div>
        ) : null}
        {open ? (
          models.length === 0 ? (
            <p className="board-frame is-empty type-small text-faint px-4 py-12 text-center">
              Choose two or more Models in the panel.
            </p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {models.map((model) => (
                <CompareColumn
                  key={model}
                  model={model}
                  node={node}
                  result={latest.get(model)}
                />
              ))}
            </div>
          )
        ) : (
          <p className="board-frame is-empty type-small text-faint h-control flex items-center px-4">
            Results folded away
          </p>
        )}
      </div>
      {selected ? (
        <SettingsBar node={node} run={run} summary={summary} />
      ) : null}
    </div>
  );
}
