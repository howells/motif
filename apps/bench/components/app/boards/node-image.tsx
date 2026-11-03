"use client";

import { useState } from "react";

import { useBoard } from "@/components/app/boards/board-context";
import { CheckIcon, PlusIcon } from "@/components/app/boards/icons";
import { Ports } from "@/components/app/boards/node-parts";
import { LiveBeats, LiveGlow } from "@/components/app/boards/process";
import { MediaImage } from "@/components/app/media-image";
import { IMAGE_HEIGHT, NODE_WIDTH, imagesOf } from "@/lib/app/boards/canvas";
import type { RunState } from "@/lib/app/boards/canvas";
import { NODE_LABELS } from "@/lib/app/boards/model";
import type { NodeViewData } from "@/lib/app/client/board-schemas";
import { formatSeconds } from "@/lib/app/money";

const elapsedOf = (since: string, now: number): number =>
  Math.max(0, now - Date.parse(since));

const makingLabel = (node: NodeViewData, images: number): string =>
  node.kind === "upscale"
    ? "Upscaling"
    : `Making ${images} ${images === 1 ? "image" : "images"}`;

/** The frame of a node being made, reading out what the run is doing. */
function LiveWell({ node }: { readonly node: NodeViewData }) {
  const { now, process } = useBoard();
  const { beats, origin } = process(node.id);
  return (
    <div className="board-live absolute inset-0">
      <LiveGlow />
      <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
        <LiveBeats beats={beats} now={now} origin={origin ?? now} />
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
    return <LiveWell node={node} />;
  }
  const elapsed = elapsedOf(run.since, now);
  const typical = run.typicalMs;
  const share =
    typical === null || run.state === "waiting"
      ? null
      : Math.min(0.95, elapsed / typical);
  return (
    <>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
        <span className="type-body font-medium">
          {run.state === "waiting"
            ? "Waiting for the node before"
            : makingLabel(node, run.expected)}
        </span>
        {run.state === "running" ? (
          <span className="type-small text-muted tabular-nums">
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

const DIDNT_FINISH = "It didn't finish";

/** Why the node's latest Generation did not finish, when it did not. */
const failureOf = (node: NodeViewData): string | null => {
  const [latest] = node.results;
  return latest?.status === "failed"
    ? (latest.error ?? "The run failed.")
    : null;
};

function Filmstrip({ node }: { readonly node: NodeViewData }) {
  const { makePick } = useBoard();
  return (
    <div className="board-well-foot absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-2 pt-8 pb-2">
      <span className="board-chip type-small">
        <CheckIcon size={14} />
        Pick
      </span>
      <ul className="flex gap-1">
        {imagesOf(node)
          .slice(0, 3)
          .map((image) => (
            <li key={image.assetId}>
              <button
                aria-label={
                  image.assetId === node.pick?.assetId
                    ? "The Pick"
                    : "Make this the Pick"
                }
                aria-pressed={image.assetId === node.pick?.assetId}
                className="board-thumb nodrag bg-surface size-control block"
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
    </div>
  );
}

/** The node's image at its frame: the Pick, what a run is doing to it, why
 * it didn't finish, or a dashed frame where it will land. */
export function NodeImage({
  node,
  run,
  selected,
}: {
  readonly node: NodeViewData;
  readonly run: RunState;
  readonly selected: boolean;
}) {
  const { chooseSource } = useBoard();
  const busy = run.state !== "idle";
  const failure = busy ? null : failureOf(node);
  const empty = node.pick === null && !busy;
  // A node that has just finished shows its image with a gentle reveal. The
  // flag is set when the run ends, in render, so the image never flashes in.
  const [wasBusy, setWasBusy] = useState(busy);
  const [arrived, setArrived] = useState(false);
  if (busy !== wasBusy) {
    setWasBusy(busy);
    setArrived(wasBusy && !busy);
  }
  return (
    <div
      className={`board-frame relative ${empty ? "is-empty" : ""} ${selected ? "is-selected" : ""} ${node.stale ? "is-stale" : ""}`}
      style={{ blockSize: IMAGE_HEIGHT[node.kind] }}
    >
      <Ports node={node} />
      <div className="absolute inset-0 overflow-hidden">
        {node.pick === null ? (
          node.kind === "source" ? (
            <button
              className="nodrag text-muted hover:text-ink type-small absolute inset-0 flex flex-col items-center justify-center gap-1"
              onClick={() => {
                chooseSource(node.id);
              }}
              type="button"
            >
              <PlusIcon />
              Choose an image
            </button>
          ) : busy || failure !== null ? null : (
            <span className="type-small text-faint absolute inset-0 flex items-center justify-center">
              {node.price?.ok === false ? "Not ready to run" : "Not run yet"}
            </span>
          )
        ) : (
          <div
            className={`board-image absolute inset-0 ${arrived ? "board-reveal" : ""}`}
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
        {node.pick !== null && (busy || failure !== null) ? (
          <span aria-hidden="true" className="board-veil absolute inset-0" />
        ) : null}
        {node.pick !== null &&
        imagesOf(node).length > 1 &&
        !busy &&
        failure === null ? (
          <Filmstrip node={node} />
        ) : null}
        {failure === null ? null : (
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pb-4">
            <p className="board-beat-current text-ink">{DIDNT_FINISH}</p>
            <p className="text-ink type-small line-clamp-2">{failure}</p>
          </div>
        )}
        {run.state === "idle" ? null : <Making node={node} run={run} />}
      </div>
    </div>
  );
}
