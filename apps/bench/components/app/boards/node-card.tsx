"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { useState } from "react";

import { useBoard } from "@/components/app/boards/board-context";
import {
  CheckIcon,
  ChevronDownIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
} from "@/components/app/boards/icons";
import {
  LiveBeats,
  LiveGlow,
  PlateProcess,
} from "@/components/app/boards/process";
import { MediaImage } from "@/components/app/media-image";
import {
  IMAGE_HEIGHT,
  LABEL_WIDTH,
  NODE_WIDTH,
  headerMeta,
  imagesOf,
  modelsOf,
  nodeWidth,
  propertyRows,
  runStateOf,
} from "@/lib/app/boards/canvas";
import type { NodeViewOf, RunState } from "@/lib/app/boards/canvas";
import { NODE_LABELS, inputOf, isRunnable } from "@/lib/app/boards/model";
import type {
  NodeViewData,
  ResultViewData,
} from "@/lib/app/client/board-schemas";
import { formatCap, formatSeconds, formatUsd } from "@/lib/app/money";

function Ports({ node }: { readonly node: NodeViewData }) {
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

function Header({
  node,
  run,
  trailing,
}: {
  readonly node: NodeViewData;
  readonly run: RunState;
  readonly trailing?: React.ReactNode;
}) {
  const meta = headerMeta(node, run);
  return (
    <header
      className={`flex h-11 items-center justify-between gap-3 ${trailing === undefined ? "px-3.5" : "pr-2 pl-3.5"}`}
    >
      <h3 className="board-title">{NODE_LABELS[node.kind]}</h3>
      <span className="flex items-center gap-1">
        {meta === null ? null : (
          <span
            className={`type-small ${meta.tone === "warning" ? "text-warn" : "text-muted"}`}
          >
            {meta.text}
          </span>
        )}
        {trailing}
      </span>
    </header>
  );
}

function Rows({ node }: { readonly node: NodeViewData }) {
  const { words } = useBoard();
  const rows = propertyRows(node, words);
  if (rows.length === 0) {
    return null;
  }
  const labelWidth = LABEL_WIDTH[node.kind] ?? 76;
  return (
    <dl
      className={`flex flex-col px-3.5 pt-1.5 pb-2 ${node.kind === "prompt" ? "board-rule-top" : ""}`}
    >
      {rows.map((row) => (
        <div className="flex h-7 items-center gap-2" key={row.label}>
          <dt
            className="type-small text-muted shrink-0"
            style={{ inlineSize: labelWidth }}
          >
            {row.label}
          </dt>
          <dd
            className={`min-w-0 truncate ${row.mono === true ? "board-mono" : "text-sm leading-5"}`}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const elapsedOf = (since: string, now: number): number =>
  Math.max(0, now - Date.parse(since));

const makingLabel = (node: NodeViewData, images: number): string =>
  node.kind === "upscale"
    ? "Upscaling"
    : `Making ${images} ${images === 1 ? "image" : "images"}`;

/** The well of a node being made, reading out what the run is doing. */
function LiveWell({
  node,
  run,
}: {
  readonly node: NodeViewData;
  readonly run: Extract<RunState, { state: "running" | "waiting" }>;
}) {
  const { now, process } = useBoard();
  const elapsed = elapsedOf(run.since, now);
  return (
    <div className="board-live absolute inset-0">
      <LiveGlow />
      <div className="absolute inset-x-0 top-0 flex items-baseline justify-between px-3.5 pt-2.5">
        <span className="type-small text-muted">
          {makingLabel(node, run.expected)}
        </span>
        <span className="board-mono text-muted">
          {formatSeconds(elapsed)}
          {run.typicalMs === null
            ? ""
            : ` of about ${formatSeconds(run.typicalMs)}`}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 px-3.5 pb-3">
        <LiveBeats
          beats={process(node.id).beats}
          depth={IMAGE_HEIGHT[node.kind] >= 150 ? 2 : 1}
        />
      </div>
    </div>
  );
}

function Making({
  node,
  run,
}: {
  readonly node: NodeViewData;
  readonly run: Extract<RunState, { state: "running" | "waiting" }>;
}) {
  const { now, process } = useBoard();
  if (run.state === "running" && process(node.id).beats.length > 0) {
    return <LiveWell node={node} run={run} />;
  }
  const elapsed = elapsedOf(run.since, now);
  const typical = run.typicalMs;
  const share =
    typical === null || run.state === "waiting"
      ? null
      : Math.min(0.95, elapsed / typical);
  const images = run.expected;
  return (
    <>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
        <span className="text-sm leading-5 font-medium">
          {run.state === "waiting"
            ? "Waiting for the node before"
            : makingLabel(node, images)}
        </span>
        {run.state === "running" ? (
          <span className="board-mono text-muted">
            {formatSeconds(elapsed)}
            {typical === null ? "" : ` of about ${formatSeconds(typical)}`}
          </span>
        ) : null}
      </div>
      {share === null ? null : (
        <span
          aria-hidden="true"
          className="board-progress absolute inset-x-0 bottom-0"
        >
          <span style={{ inlineSize: `${Math.round(share * 100)}%` }} />
        </span>
      )}
    </>
  );
}

function ImageArea({
  node,
  run,
}: {
  readonly node: NodeViewData;
  readonly run: RunState;
}) {
  const { chooseSource, makePick } = useBoard();
  const height = IMAGE_HEIGHT[node.kind];
  const images = imagesOf(node);
  const busy = run.state !== "idle";
  const thumbs = images.slice(0, 4);
  // A node that has just finished shows its image with a gentle reveal. The
  // flag is set when the run ends, in render, so the image never flashes in.
  const [wasBusy, setWasBusy] = useState(busy);
  const [arrived, setArrived] = useState(false);
  if (busy !== wasBusy) {
    setWasBusy(busy);
    setArrived(wasBusy && !busy);
  }
  return (
    <>
      <div
        className="bg-surface relative overflow-hidden"
        style={{ blockSize: height }}
      >
        {node.pick === null ? (
          node.kind === "source" ? (
            <button
              className="nodrag text-muted hover:text-ink absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm"
              onClick={() => {
                chooseSource(node.id);
              }}
              type="button"
            >
              <PlusIcon />
              Choose an image
            </button>
          ) : busy ? null : (
            <span className="type-small text-muted absolute inset-0 flex items-center justify-center">
              {node.price?.ok === false
                ? "Not ready to run"
                : "Run to see it here"}
            </span>
          )
        ) : (
          <div
            className={`board-image absolute inset-0 transition-opacity ${busy ? "opacity-45" : ""} ${arrived ? "board-reveal" : ""}`}
            key={arrived ? node.pick.assetId : "settled"}
          >
            <MediaImage
              alt={`${NODE_LABELS[node.kind]} Pick`}
              fit={
                node.kind === "reframe" || node.kind === "cutout"
                  ? "contain"
                  : "cover"
              }
              sizes={`${NODE_WIDTH[node.kind]}px`}
              src={node.pick.url}
            />
          </div>
        )}
        {node.pick !== null && images.length > 1 && !busy ? (
          <span className="board-chip absolute bottom-2 left-2">
            <CheckIcon size={14} />
            Pick
          </span>
        ) : null}
        {run.state === "idle" ? null : <Making node={node} run={run} />}
      </div>
      {thumbs.length > 1 ? (
        <ul className="flex gap-2 px-3.5 pt-2.5">
          {thumbs.map((image) => (
            <li key={image.assetId}>
              <button
                aria-label={
                  image.assetId === node.pick?.assetId
                    ? "The Pick"
                    : "Make this the Pick"
                }
                aria-pressed={image.assetId === node.pick?.assetId}
                className="board-thumb nodrag bg-surface block size-11"
                onClick={() => {
                  makePick(node, image.assetId);
                }}
                type="button"
              >
                <MediaImage alt="" sizes="44px" src={image.url} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function Footer({
  node,
  run,
}: {
  readonly node: NodeViewData;
  readonly run: RunState;
}) {
  const { openRun, stop } = useBoard();
  const price = node.price;
  return (
    <footer className="board-rule-top flex h-13 items-center justify-between gap-2 pr-1 pl-3.5">
      {price === null ? (
        <span />
      ) : price.ok ? (
        <span
          className="board-mono"
          title={price.usage ? "Billed by usage" : undefined}
        >
          {price.usage
            ? `Up to ${formatCap(price.listMicros)}`
            : formatUsd(price.listMicros)}
        </span>
      ) : (
        <span className="type-small text-muted truncate" title={price.reason}>
          Not ready
        </span>
      )}
      {run.state === "idle" ? (
        <button
          className="board-quiet nodrag hover:bg-surface gap-1.5 pr-3.5 pl-3 text-sm leading-5 font-medium"
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
          className="board-quiet nodrag hover:bg-surface gap-1.5 pr-3.5 pl-3 text-sm leading-5 font-medium"
          onClick={() => {
            stop(run.run.id);
          }}
          type="button"
        >
          <StopIcon />
          Stop
        </button>
      )}
    </footer>
  );
}

function PromptBody({ node }: { readonly node: NodeViewOf<"prompt"> }) {
  const { text } = node.settings;
  return (
    <p
      className={`line-clamp-5 px-3.5 pb-3 text-sm leading-5 ${text.trim() === "" ? "text-faint" : ""}`}
    >
      {text.trim() === "" ? "Write what you want to see" : text}
    </p>
  );
}

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
  return (
    <div className="flex w-68 flex-col gap-2.5">
      <div
        className={`board-plate-well relative size-68 overflow-hidden rounded ${picked ? "is-picked" : ""}`}
      >
        {output === undefined ? (
          <span className="type-small text-plate-muted absolute inset-0 flex items-center justify-center px-6 text-center">
            {wellNote(result)}
          </span>
        ) : (
          <MediaImage
            alt={node.names[model] ?? model}
            sizes="272px"
            src={output.url}
          />
        )}
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-plate-ink truncate text-sm leading-5 font-medium">
            {node.names[model] ?? result?.modelName ?? model}
          </span>
          <span className="board-mono text-plate-muted">
            {columnFacts(result)}
          </span>
        </div>
        {output === undefined ? null : picked ? (
          <span className="bg-plate-ink text-plate flex h-11 shrink-0 items-center gap-1.5 rounded px-3 text-sm leading-5 font-medium">
            <CheckIcon size={16} />
            Pick
          </span>
        ) : (
          <button
            className="nodrag text-plate-ink board-plate-button flex h-11 shrink-0 items-center rounded px-3 text-sm leading-5"
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

function CompareColumns({ node }: { readonly node: NodeViewData }) {
  const models = modelsOf(node);
  const latest = latestPerModel(node);
  if (models.length === 0) {
    return (
      <p className="type-small text-plate-muted px-4 py-10 text-center">
        Choose two or more Models in the panel.
      </p>
    );
  }
  return (
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

function CompareCard({
  node,
  run,
  selected,
}: {
  readonly node: NodeViewData;
  readonly run: RunState;
  readonly selected: boolean;
}) {
  const { openRun, process, stop } = useBoard();
  const [open, setOpen] = useState(true);
  const fastest = fastestOf(node);
  const live = process(node.id);
  return (
    <div
      className={`board-card ${selected ? "is-selected" : ""} ${node.stale ? "is-stale" : ""}`}
      style={{ inlineSize: nodeWidth("compare", node) }}
    >
      <Ports node={node} />
      <Header
        node={node}
        run={run}
        trailing={
          <button
            aria-expanded={open}
            aria-label={open ? "Fold the results away" : "Show the results"}
            className="board-quiet nodrag hover:bg-surface"
            onClick={() => {
              setOpen(!open);
            }}
            type="button"
          >
            <ChevronDownIcon className={open ? "" : "-rotate-90"} />
          </button>
        }
      />
      {open ? (
        <div className={`bg-plate p-4 ${node.stale ? "board-image" : ""}`}>
          {live.live ? <PlateProcess process={live} /> : null}
          <CompareColumns node={node} />
        </div>
      ) : null}
      <footer className="board-rule-top flex h-13 items-center gap-4 pr-1 pl-3.5">
        <span className="board-mono">
          {node.price?.ok === true ? formatUsd(node.price.listMicros) : ""}
        </span>
        <span className="type-small text-muted flex-1 truncate">
          {node.price?.ok === false
            ? node.price.reason
            : fastest === null
              ? ""
              : `Fastest: ${fastest.modelName}, ${formatSeconds(fastest.elapsedMs ?? 0)}`}
        </span>
        {run.state === "idle" ? (
          <button
            className="board-quiet nodrag hover:bg-surface gap-1.5 pr-3.5 pl-3 text-sm leading-5 font-medium"
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
            className="board-quiet nodrag hover:bg-surface gap-1.5 pr-3.5 pl-3 text-sm leading-5 font-medium"
            onClick={() => {
              stop(run.run.id);
            }}
            type="button"
          >
            <StopIcon />
            Stop
          </button>
        )}
      </footer>
    </div>
  );
}

/** One node on the canvas, drawn for its kind. */
export function NodeCard({ id, selected }: NodeProps) {
  const { view } = useBoard();
  const node = view.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) {
    return null;
  }
  const run = runStateOf(view, node);
  if (node.kind === "compare") {
    return <CompareCard node={node} run={run} selected={selected} />;
  }
  const hasImage = IMAGE_HEIGHT[node.kind] > 0;
  return (
    <div
      className={`board-card ${selected ? "is-selected" : ""} ${node.stale ? "is-stale" : ""}`}
      style={{ inlineSize: NODE_WIDTH[node.kind] }}
    >
      <Ports node={node} />
      <Header node={node} run={run} />
      {node.kind === "prompt" ? <PromptBody node={node} /> : null}
      {hasImage ? <ImageArea node={node} run={run} /> : null}
      <Rows node={node} />
      {isRunnable(node.kind) ? <Footer node={node} run={run} /> : null}
    </div>
  );
}
