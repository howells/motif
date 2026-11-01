"use client";

import { BaseEdge, getBezierPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";

import { useBoard } from "@/components/app/boards/board-context";

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
  const stale = view.nodes.find((node) => node.id === target)?.stale ?? false;
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
  );
}
