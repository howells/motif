"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { applyNodeChanges } from "@xyflow/react";
import type { Edge, Node, NodeChange } from "@xyflow/react";
import { useState } from "react";

import { useNow } from "@/components/app/boards/use-now";
import { isRunning, nodeWidth } from "@/lib/app/boards/canvas";
import type { SettingsPatch } from "@/lib/app/boards/model";
import { estimatedHeight } from "@/lib/app/boards/viewport";
import { api, messageOf } from "@/lib/app/client/api";
import {
  BoardViewSchema,
  NodeViewSchema,
  RunReply,
  RunResultsReply,
} from "@/lib/app/client/board-schemas";
import type {
  BoardViewData,
  NodeViewData,
  RunViewData,
} from "@/lib/app/client/board-schemas";
import { SPEND_KEY, useAfterSettle } from "@/lib/app/client/settled";

export interface Change {
  readonly path: string;
  readonly method?: "PATCH" | "POST";
  readonly body?: unknown;
}

/** The node with a change to its settings, read back through the node's
 * own schema; `null` if the change doesn't fit it. Cleared keys drop out. */
const changed = (
  node: NodeViewData,
  patch: SettingsPatch
): NodeViewData | null => {
  const settings = Object.fromEntries(
    Object.entries({ ...node.settings, ...patch }).filter(
      ([, value]) => value !== undefined
    )
  );
  const read = NodeViewSchema.safeParse({ ...node, settings });
  return read.success ? read.data : null;
};

interface Move {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/** Where dragged nodes now sit; `false` if that wasn't saved. */
const savePositions = async (
  boardId: string,
  moves: readonly Move[]
): Promise<boolean> => {
  try {
    const response = await fetch(`/api/app/boards/${boardId}/positions`, {
      body: JSON.stringify({ moves }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * The Board as the server last described it, and every change to it. Each
 * change is sent, and the Board the server sends back replaces the one on
 * screen. While a run is going the Board is polled, and the run itself is
 * polled less often so a run whose function stopped is carried on.
 */
export const useBoardData = (initial: BoardViewData) => {
  const boardId = initial.board.id;
  const key = ["board", boardId];
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<string | null>(null);

  const board = useQuery({
    initialData: initial,
    queryFn: async () =>
      await api(`/api/app/boards/${boardId}`, BoardViewSchema),
    queryKey: key,
    refetchInterval: (query) => (isRunning(query.state.data) ? 2000 : false),
  });
  const view = board.data;
  const running = view.runs.find((run) => run.status === "running");
  const runningId = running?.id ?? null;

  useQuery({
    enabled: runningId !== null,
    queryFn: async () =>
      await api(`/api/app/board-runs/${runningId ?? ""}`, RunResultsReply),
    queryKey: ["board-run", runningId],
    refetchInterval: 10_000,
  });

  const now = useNow(runningId !== null);
  // The rail's spend and Inbox count, and the Library, catch up the moment
  // the run settles, without a reload.
  useAfterSettle(runningId !== null);

  /** Read the Board again now: a Pick was kept, or the run ended. */
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
  };

  const apply = (next: BoardViewData) => {
    queryClient.setQueryData(key, next);
  };

  const patchCache = (update: (current: BoardViewData) => BoardViewData) => {
    queryClient.setQueryData<BoardViewData>(key, (current) =>
      current === undefined ? current : update(current)
    );
  };

  /** Send one change; the Board that comes back is the one shown. */
  const send = async (change: Change): Promise<BoardViewData | null> => {
    setProblem(null);
    try {
      const next = await api(change.path, BoardViewSchema, {
        body: change.body ?? {},
        method: change.method ?? "POST",
      });
      apply(next);
      return next;
    } catch (error) {
      setProblem(messageOf(error));
      await queryClient.invalidateQueries({ queryKey: key });
      return null;
    }
  };

  const editSettings = (node: NodeViewData, patch: SettingsPatch) => {
    const next = changed(node, patch);
    if (next === null) {
      setProblem("That setting doesn’t fit this node.");
      return;
    }
    patchCache((current) => ({
      ...current,
      nodes: current.nodes.map((item) => (item.id === node.id ? next : item)),
    }));
    void send({
      body: { settings: next.settings },
      method: "PATCH",
      path: `/api/app/nodes/${node.id}`,
    });
  };

  const makePick = (node: NodeViewData, assetId: string) => {
    if (assetId !== node.pick?.assetId) {
      void send({
        body: { pickAssetId: assetId },
        method: "PATCH",
        path: `/api/app/nodes/${node.id}`,
      });
    }
  };

  const stop = async (runId: string) => {
    try {
      await api(`/api/app/board-runs/${runId}/stop`, RunReply);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      setProblem(messageOf(error));
    }
  };

  const started = async (run: RunViewData) => {
    patchCache((current) => ({
      ...current,
      runs: [run, ...current.runs.filter((item) => item.id !== run.id)],
    }));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      // The hold now shows on the spend meter.
      queryClient.invalidateQueries({ queryKey: SPEND_KEY }),
    ]);
  };

  const moved = async (moves: readonly Move[]) => {
    const at = new Map(moves.map((move) => [move.id, move]));
    patchCache((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        const move = at.get(node.id);
        return move === undefined ? node : { ...node, x: move.x, y: move.y };
      }),
    }));
    if (!(await savePositions(boardId, moves))) {
      setProblem("Where the nodes sit wasn’t saved. Move them again.");
    }
  };

  return {
    editSettings,
    makePick,
    moved,
    now,
    problem,
    refresh,
    send,
    setProblem,
    started,
    stop,
    view,
  };
};

interface Local {
  readonly position?: { x: number; y: number };
  readonly measured?: { width?: number; height?: number };
  readonly selected?: boolean;
  readonly dragging?: boolean;
}

/** React Flow's nodes for a Board: where each sits comes from the server,
 * except while it is being dragged; size and selection come from `local`. */
export const flowNodes = (
  view: BoardViewData,
  local: ReadonlyMap<string, Local> = new Map()
): Node[] =>
  view.nodes.map((node) => {
    const entry = local.get(node.id);
    const dragging = entry?.dragging === true;
    return {
      data: {},
      id: node.id,
      // Until the canvas measures a card, its known width and a fair guess
      // at its height let the first paint (and a server render) place it.
      initialHeight: estimatedHeight(node.kind),
      initialWidth: nodeWidth(node.kind, node),
      position:
        dragging && entry?.position !== undefined
          ? entry.position
          : { x: node.x, y: node.y },
      selected: entry?.selected ?? false,
      type: node.kind,
      ...(entry?.measured !== undefined && { measured: entry.measured }),
      ...(entry?.dragging !== undefined && { dragging: entry.dragging }),
    };
  });

/** React Flow's edges: one wire, out of one node and into the next. */
export const flowEdges = (view: BoardViewData): Edge[] =>
  view.wires.map((wire) => ({
    id: wire.id,
    source: wire.from,
    sourceHandle: "out",
    target: wire.to,
    targetHandle: "in",
    type: "wire",
  }));

/**
 * React Flow's nodes, drawn from the Board: where each sits comes from the
 * server, except while it is being dragged; size and selection are kept
 * here, since only the canvas knows them.
 */
export const useCanvas = (view: BoardViewData) => {
  const [local, setLocal] = useState<ReadonlyMap<string, Local>>(new Map());
  const live = new Set(view.nodes.map((node) => node.id));
  let selectedId: string | null = null;
  for (const [id, entry] of local) {
    if (entry.selected === true && live.has(id)) {
      selectedId = id;
    }
  }

  const nodes = flowNodes(view, local);
  const edges = flowEdges(view);

  const onNodesChange = (changes: NodeChange[]) => {
    const next = applyNodeChanges(
      changes.filter((change) => change.type !== "remove"),
      nodes
    );
    setLocal(
      new Map(
        next.map((node) => [
          node.id,
          {
            dragging: node.dragging,
            measured: node.measured,
            position: node.position,
            selected: node.selected,
          },
        ])
      )
    );
  };

  const select = (nodeId: string | null) => {
    setLocal((current) => {
      const next = new Map<string, Local>();
      for (const [id, entry] of current) {
        next.set(id, { ...entry, selected: id === nodeId });
      }
      if (nodeId !== null && !next.has(nodeId)) {
        next.set(nodeId, { selected: true });
      }
      return next;
    });
  };

  return { edges, handleNodesChange: onNodesChange, nodes, select, selectedId };
};
