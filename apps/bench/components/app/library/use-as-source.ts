"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { nodeWidth } from "@/lib/app/boards/canvas";
import { api } from "@/lib/app/client/api";
import { BoardViewSchema } from "@/lib/app/client/board-schemas";
import type { BoardViewData } from "@/lib/app/client/board-schemas";

/** Room between the new Source and whatever sits furthest right. */
const GAP = 64;

/** Where a new Source goes: to the right of everything on the Board, level
 * with its top row, so it never lands on another node. */
const besideEverything = (view: BoardViewData) => {
  if (view.nodes.length === 0) {
    return { x: 0, y: 0 };
  }
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  for (const node of view.nodes) {
    right = Math.max(right, node.x + nodeWidth(node.kind, node));
    top = Math.min(top, node.y);
  }
  return { x: Math.round(right + GAP), y: Math.round(top) };
};

/** Put an image on a Board as a Source node, then open that Board. Nothing
 * is spent: a Source only holds an image. */
export const useAsSource = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assetId,
      boardId,
    }: {
      readonly assetId: string;
      readonly boardId: string;
    }) => {
      const view = await api(`/api/app/boards/${boardId}`, BoardViewSchema);
      await api(`/api/app/boards/${boardId}/nodes`, BoardViewSchema, {
        body: {
          kind: "source",
          settings: { assetId },
          ...besideEverything(view),
        },
      });
      return boardId;
    },
    onSuccess: async (boardId) => {
      await queryClient.invalidateQueries({ queryKey: ["board", boardId] });
      router.push(`/boards/${boardId}`);
    },
  });
};
