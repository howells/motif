"use client";

import { BaseEdge, getBezierPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";

import { useBoard } from "@/components/app/boards/board-context";
import { runStateOf } from "@/lib/app/boards/canvas";

/** A wire: a soft ink curve, dashed amber when it leads into a Stale node. */
export function Wire({
  id,
  sourcePosition,
  sourceX,
  sourceY,
  target,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps) {
  const { view } = useBoard();
  const into = view.nodes.find((node) => node.id === target);
  const stale = into?.stale ?? false;
  // A slow pulse travels the wire into a node that is being made.
  const making =
    into !== undefined && runStateOf(view, into).state === "running";
  const [path] = getBezierPath({
    curvature: 0.35,
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  });
  return (
    <>
      <BaseEdge
        className="board-wire"
        id={id}
        interactionWidth={16}
        path={path}
        style={{
          stroke: stale ? "rgb(139 101 43 / 70%)" : "rgb(28 27 26 / 45%)",
          strokeDasharray: stale ? "4 4" : undefined,
          strokeWidth: 1.5,
        }}
      />
      {making ? (
        <path
          aria-hidden="true"
          className="board-wire-pulse"
          d={path}
          pathLength={100}
        />
      ) : null}
    </>
  );
}
