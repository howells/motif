"use client";

import { useQuery } from "@tanstack/react-query";

import { useBoard } from "@/components/app/boards/board-context";
import { api } from "@/lib/app/client/api";
import { NodeOptionsSchema } from "@/lib/app/client/board-schemas";
import type {
  BoardViewData,
  NodeViewData,
} from "@/lib/app/client/board-schemas";

/** Changes whenever what decides a node's price does, so its Models are
 * priced again. */
export const versionOf = (node: NodeViewData, view: BoardViewData): string => {
  const parent = view.wires.find((wire) => wire.to === node.id)?.from;
  const upstream = view.nodes.find((candidate) => candidate.id === parent);
  return JSON.stringify([
    node.settings,
    upstream?.pick?.assetId ?? null,
    upstream?.settings ?? null,
  ]);
};

/** A node's Models, each priced on its real inputs, and Motif's choice. */
export const useNodeOptions = (node: NodeViewData) => {
  const { view } = useBoard();
  return useQuery({
    queryFn: async () =>
      await api(`/api/app/nodes/${node.id}/options`, NodeOptionsSchema),
    queryKey: ["options", node.id, versionOf(node, view)],
  });
};
