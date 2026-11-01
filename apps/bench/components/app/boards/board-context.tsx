"use client";

import { createContext, use } from "react";

import type { Vocabulary } from "@/lib/app/boards/canvas";
import type { RunScope, SettingsPatch } from "@/lib/app/boards/model";
import type { NodeProcess } from "@/lib/app/boards/process";
import type {
  BoardViewData,
  NodeViewData,
} from "@/lib/app/client/board-schemas";

/** What a node on the canvas can ask of the Board it sits on. */
export interface BoardActions {
  readonly view: BoardViewData;
  readonly words: Vocabulary;
  readonly selectedId: string | null;
  readonly now: number;
  /** What the latest run said about a node, while it works and after. */
  readonly process: (nodeId: string) => NodeProcess;
  readonly select: (nodeId: string | null) => void;
  readonly editSettings: (node: NodeViewData, patch: SettingsPatch) => void;
  readonly makePick: (node: NodeViewData, assetId: string) => void;
  readonly openRun: (nodeId: string, scope: RunScope) => void;
  readonly stop: (runId: string) => void;
  readonly chooseSource: (nodeId: string) => void;
}

export const BoardContext = createContext<BoardActions | null>(null);

export const useBoard = (): BoardActions => {
  const value = use(BoardContext);
  if (value === null) {
    throw new Error("A Board node rendered outside its Board.");
  }
  return value;
};

/** The node a canvas component draws, from the current Board view. */
export const useNodeView = (nodeId: string): NodeViewData | null =>
  useBoard().view.nodes.find((node) => node.id === nodeId) ?? null;
