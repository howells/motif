/**
 * What the Board routes do, one function per action, each acting only on the
 * member's own Boards. Routes parse and authorise; these load, check, write
 * and return the Board as the browser should now see it.
 */
import { CREATIVE_TAXONOMY, LOOKS } from "@howells/motif-sdk";
import type { AppSql } from "@motif/bench-db/app-sql";

import type { Member } from "../auth/members";
import { monthSummary } from "../budget/ledger";
import { getOwnedAsset } from "../media/assets";
import { formatUsd } from "../money";
import { getOwnedGenerations } from "../tasks/store";
import {
  isRunnable,
  parseSettings,
  staleAfterEdit,
  staleAfterPick,
  wireRefusal,
} from "./model";
import type { KindSettings, NodeKind, RunScope, SettingsInput } from "./model";
import { inputFor, pickSizes, quoteNode, quoteRun } from "./plan";
import type { RunQuote } from "./plan";
import { createRun, latestRuns } from "./run-store";
import type { BoardRun, RunStep } from "./run-store";
import { configurationKey } from "./snapshot";
import {
  addNode,
  addWire,
  getGraph,
  getOwnedBoard,
  getOwnedNode,
  listResults,
  markStale,
  removeNode,
  removeWire,
  setPick,
  updateSettings,
} from "./store";
import type { Board, BoardNode, Graph } from "./store";
import { boardView, resultView } from "./views";
import type { BoardView, PriceView, ResultView } from "./views";

export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: string;
      readonly message: string;
      readonly details?: Readonly<Record<string, number>>;
    };

export const refuse = <T>(
  status: number,
  code: string,
  message: string,
  details?: Readonly<Record<string, number>>
): Outcome<T> => ({
  code,
  message,
  ok: false,
  status,
  ...(details !== undefined && { details }),
});

const NOT_FOUND = "That isn't one of your Boards.";

const LOOK_IDS: ReadonlySet<string> = new Set(LOOKS.map((look) => look.id));
const MOOD_IDS: ReadonlySet<string> = new Set(
  CREATIVE_TAXONOMY.mood.map((mood) => mood.id)
);

/** Settings checked against the SDK: real Looks and Moods only. */
export const checkSettings = (
  kind: NodeKind,
  value?: SettingsInput
): Outcome<KindSettings> => {
  const parsed = parseSettings(kind, value);
  if (!parsed.ok) {
    return refuse(400, "INVALID_SETTINGS", parsed.message);
  }
  const { node } = parsed;
  if (node.kind === "prompt") {
    const { look, mood } = node.settings;
    if (look !== undefined && look !== "" && !LOOK_IDS.has(look)) {
      return refuse(400, "INVALID_SETTINGS", "Unknown Look.");
    }
    if (mood !== undefined && mood !== "" && !MOOD_IDS.has(mood)) {
      return refuse(400, "INVALID_SETTINGS", "Unknown Mood.");
    }
  }
  return { ok: true, value: node };
};

// ── Reading ───────────────────────────────────────────────────────────

/** The Board as the canvas draws it. */
export const loadBoardView = async (
  sql: AppSql,
  ownerId: string,
  board: Board
): Promise<BoardView> => {
  const [graph, results, runs] = await Promise.all([
    getGraph(sql, ownerId, board.id),
    listResults(sql, ownerId, board.id),
    latestRuns(sql, ownerId, board.id),
  ]);
  const [sizes, generations] = await Promise.all([
    pickSizes(sql, ownerId, graph),
    getOwnedGenerations(
      sql,
      ownerId,
      results.map((result) => result.generationId)
    ),
  ]);
  const byId = new Map(
    generations.map((generation) => [generation.id, generation])
  );
  const perNode = new Map<string, ResultView[]>();
  for (const result of results.toReversed()) {
    const generation = byId.get(result.generationId);
    if (generation === undefined) {
      continue;
    }
    perNode.set(result.nodeId, [
      ...(perNode.get(result.nodeId) ?? []),
      resultView(generation, result.runId),
    ]);
  }
  const prices = new Map<string, PriceView>();
  for (const node of graph.nodes) {
    if (!isRunnable(node.kind)) {
      continue;
    }
    const quoted = quoteNode(
      node,
      inputFor(node, graph, sizes),
      ownerId,
      sizes
    );
    prices.set(
      node.id,
      quoted.ok
        ? {
            detail: quoted.detail,
            listMicros: quoted.listMicros,
            ok: true,
            usage: quoted.usage,
          }
        : { ok: false, reason: quoted.reason }
    );
  }
  return boardView({
    board,
    nodes: graph.nodes,
    prices,
    results: perNode,
    runs,
    sizes,
    wires: graph.wires,
  });
};

export const boardViewById = async (
  sql: AppSql,
  ownerId: string,
  boardId: string
): Promise<Outcome<BoardView>> => {
  const board = await getOwnedBoard(sql, ownerId, boardId);
  if (board === null) {
    return refuse(404, "NOT_FOUND", NOT_FOUND);
  }
  return { ok: true, value: await loadBoardView(sql, ownerId, board) };
};

// ── Editing ───────────────────────────────────────────────────────────

export interface AddNodeInput {
  readonly kind: NodeKind;
  readonly x: number;
  readonly y: number;
  readonly settings?: SettingsInput;
  /** Start a Source from one of the member's images. */
  readonly assetId?: string;
  /** Wire the new node from this one. */
  readonly from?: string;
}

export const createBoardNode = async (
  sql: AppSql,
  ownerId: string,
  boardId: string,
  input: AddNodeInput
): Promise<Outcome<BoardNode>> => {
  const board = await getOwnedBoard(sql, ownerId, boardId);
  if (board === null) {
    return refuse(404, "NOT_FOUND", NOT_FOUND);
  }
  const checked = checkSettings(input.kind, input.settings);
  if (!checked.ok) {
    return checked;
  }
  let pickAssetId: string | null = null;
  if (input.assetId !== undefined) {
    if (input.kind !== "source") {
      return refuse(400, "NOT_A_SOURCE", "Only a Source starts from an image.");
    }
    const asset = await getOwnedAsset(sql, ownerId, input.assetId);
    if (asset === null || asset.kind === "mask") {
      return refuse(
        404,
        "IMAGE_NOT_FOUND",
        "That image isn't in your Library."
      );
    }
    pickAssetId = asset.id;
  }
  const typed: KindSettings =
    pickAssetId !== null && checked.value.kind === "source"
      ? {
          kind: "source",
          settings: { ...checked.value.settings, assetId: pickAssetId },
        }
      : checked.value;
  const node = await addNode(sql, ownerId, boardId, {
    ...typed,
    pickAssetId,
    x: input.x,
    y: input.y,
  });
  if (node === null) {
    return refuse(404, "NOT_FOUND", NOT_FOUND);
  }
  if (input.from !== undefined) {
    const wired = await connect(sql, ownerId, boardId, input.from, node.id);
    if (!wired.ok) {
      return wired;
    }
  }
  return { ok: true, value: node };
};

/** Add a node and return the refreshed canvas to the browser. */
export const addBoardNode = async (
  sql: AppSql,
  ownerId: string,
  boardId: string,
  input: AddNodeInput
): Promise<Outcome<BoardView>> => {
  const added = await createBoardNode(sql, ownerId, boardId, input);
  return added.ok ? await boardViewById(sql, ownerId, boardId) : added;
};

export interface NodeEdit {
  readonly settings?: SettingsInput;
  readonly pickAssetId?: string;
}

/**
 * Change a node's settings or its Pick. A new setting makes the node and
 * what it feeds Stale; a new Pick makes what it feeds Stale. Nothing spends.
 */
export const editNode = async (
  sql: AppSql,
  ownerId: string,
  nodeId: string,
  edit: NodeEdit
): Promise<Outcome<BoardView>> => {
  const node = await getOwnedNode(sql, ownerId, nodeId);
  if (node === null) {
    return refuse(404, "NOT_FOUND", "That node isn't on one of your Boards.");
  }
  const graph = await getGraph(sql, ownerId, node.boardId);
  if (edit.settings !== undefined) {
    const checked = checkSettings(node.kind, edit.settings);
    if (!checked.ok) {
      return checked;
    }
    let pick: { assetId: string | null } | undefined;
    if (checked.value.kind === "source") {
      const { assetId } = checked.value.settings;
      if (assetId === undefined) {
        pick = { assetId: null };
      } else {
        const asset = await getOwnedAsset(sql, ownerId, assetId);
        if (asset === null || asset.kind === "mask") {
          return refuse(
            404,
            "IMAGE_NOT_FOUND",
            "That image isn't in your Library."
          );
        }
        pick = { assetId };
      }
    }
    const changed =
      JSON.stringify(checked.value.settings) !== JSON.stringify(node.settings);
    const stale = changed
      ? node.kind === "source"
        ? staleAfterPick(node.id, graph.nodes, graph.wires)
        : staleAfterEdit(node.id, graph.nodes, graph.wires)
      : [];
    await updateSettings(
      sql,
      ownerId,
      node.id,
      checked.value.settings,
      stale,
      pick
    );
  }
  if (edit.pickAssetId !== undefined && edit.pickAssetId !== node.pickAssetId) {
    const stale = staleAfterPick(node.id, graph.nodes, graph.wires);
    const picked = await setPick(
      sql,
      ownerId,
      node.id,
      edit.pickAssetId,
      stale
    );
    if (!picked) {
      return refuse(400, "NOT_A_RESULT", "Pick one of this node's own images.");
    }
  }
  return await boardViewById(sql, ownerId, node.boardId);
};

export const removeBoardNode = async (
  sql: AppSql,
  ownerId: string,
  nodeId: string
): Promise<Outcome<BoardView>> => {
  const node = await getOwnedNode(sql, ownerId, nodeId);
  if (node === null) {
    return refuse(404, "NOT_FOUND", "That node isn't on one of your Boards.");
  }
  const graph = await getGraph(sql, ownerId, node.boardId);
  await removeNode(sql, ownerId, nodeId);
  await markStale(
    sql,
    ownerId,
    staleAfterPick(nodeId, graph.nodes, graph.wires)
  );
  return await boardViewById(sql, ownerId, node.boardId);
};

/** Wire one node into another, replacing what fed it. What it now feeds
 * goes Stale. */
export const connect = async (
  sql: AppSql,
  ownerId: string,
  boardId: string,
  from: string,
  to: string
): Promise<Outcome<BoardView>> => {
  const graph = await getGraph(sql, ownerId, boardId);
  const source = graph.nodes.find((node) => node.id === from);
  const target = graph.nodes.find((node) => node.id === to);
  if (source === undefined || target === undefined) {
    return refuse(404, "NOT_FOUND", "Both ends must be on this Board.");
  }
  const refusal = wireRefusal(source, target, graph.wires);
  if (refusal !== null) {
    return refuse(400, "INVALID_WIRE", refusal);
  }
  const stale = staleAfterEdit(target.id, graph.nodes, graph.wires);
  const wire = await addWire(sql, ownerId, boardId, from, to, stale);
  if (wire === null) {
    return refuse(404, "NOT_FOUND", "Both ends must be on this Board.");
  }
  return await boardViewById(sql, ownerId, boardId);
};

export const disconnect = async (
  sql: AppSql,
  ownerId: string,
  wireId: string
): Promise<Outcome<BoardView>> => {
  const wire = await removeWire(sql, ownerId, wireId);
  if (wire === null) {
    return refuse(404, "NOT_FOUND", "That wire isn't on one of your Boards.");
  }
  const node = await getOwnedNode(sql, ownerId, wire.to);
  if (node === null) {
    return refuse(404, "NOT_FOUND", NOT_FOUND);
  }
  const graph = await getGraph(sql, ownerId, node.boardId);
  await markStale(
    sql,
    ownerId,
    staleAfterEdit(node.id, graph.nodes, graph.wires)
  );
  return await boardViewById(sql, ownerId, node.boardId);
};

// ── Pricing and running ───────────────────────────────────────────────

export interface QuoteView extends RunQuote {
  readonly configuration: string;
  readonly availableMicros: number;
  readonly capMicros: number;
  readonly month: string;
}

const quoteBoardGraph = async (
  sql: AppSql,
  ownerId: string,
  boardId: string,
  fromNodeId: string,
  scope: RunScope
): Promise<Outcome<QuoteView & { readonly graph: Graph }>> => {
  const board = await getOwnedBoard(sql, ownerId, boardId);
  if (board === null) {
    return refuse(404, "NOT_FOUND", NOT_FOUND);
  }
  const graph = await getGraph(sql, ownerId, boardId);
  if (!graph.nodes.some((node) => node.id === fromNodeId)) {
    return refuse(404, "NOT_FOUND", "That node isn't on this Board.");
  }
  const [sizes, budget] = await Promise.all([
    pickSizes(sql, ownerId, graph),
    monthSummary(sql),
  ]);
  const quoted = quoteRun(graph, fromNodeId, scope, sizes, ownerId);
  return {
    ok: true,
    value: {
      ...quoted,
      configuration: configurationKey(graph),
      graph,
      availableMicros: Math.max(
        0,
        budget.capMicros - budget.spentMicros - budget.heldMicros
      ),
      capMicros: budget.capMicros,
      month: budget.month,
    },
  };
};

/** Price the current Board without exposing its internal snapshot. */
export const quoteBoardRun = async (
  sql: AppSql,
  ownerId: string,
  boardId: string,
  fromNodeId: string,
  scope: RunScope
): Promise<Outcome<QuoteView>> => {
  const quoted = await quoteBoardGraph(
    sql,
    ownerId,
    boardId,
    fromNodeId,
    scope
  );
  if (!quoted.ok) {
    return quoted;
  }
  const { graph: _graph, ...value } = quoted.value;
  return { ok: true, value };
};

/**
 * Record an approved run. It starts only when the price the person
 * approved still holds: the run is priced again here, and refused if any
 * step is blocked or the total has gone up.
 */
export const startBoardRun = async (
  sql: AppSql,
  member: Member,
  input: {
    readonly boardId: string;
    readonly fromNodeId: string;
    readonly scope: RunScope;
    readonly idempotencyKey: string;
    readonly approvedMicros: number;
    readonly approvedConfiguration?: string;
  }
): Promise<
  Outcome<{ readonly run: BoardRun; readonly duplicate: boolean }>
> => {
  const quoted = await quoteBoardGraph(
    sql,
    member.id,
    input.boardId,
    input.fromNodeId,
    input.scope
  );
  if (!quoted.ok) {
    return quoted;
  }
  const { value } = quoted;
  if (!value.ready) {
    const blocked = value.steps.find((step) => !step.ok);
    return refuse(
      409,
      "NOT_READY",
      blocked !== undefined && !blocked.ok
        ? `${blocked.label}: ${blocked.reason}`
        : "There's nothing here to run."
    );
  }
  if (
    value.micros > input.approvedMicros ||
    (input.approvedConfiguration !== undefined &&
      input.approvedConfiguration !== value.configuration)
  ) {
    return refuse(
      409,
      "PRICE_CHANGED",
      "The price changed since you approved it. Look again before running.",
      { micros: value.micros }
    );
  }
  if (value.micros > value.availableMicros) {
    return refuse(
      402,
      "CAP_REACHED",
      `This holds ${formatUsd(value.micros)}, more than the ${formatUsd(value.availableMicros)} left this month, so it hasn't started.`,
      {
        availableMicros: value.availableMicros,
        requestedMicros: value.micros,
      }
    );
  }
  const priced = new Map(value.steps.map((step) => [step.nodeId, step]));
  const steps: RunStep[] = [];
  for (const [index, level] of value.levels.entries()) {
    for (const nodeId of level) {
      const step = priced.get(nodeId);
      if (step?.ok === true) {
        steps.push({
          level: index,
          micros: step.micros,
          nodeId,
          ...(steps.length === 0 && { snapshot: value.graph }),
        });
      }
    }
  }
  const created = await createRun(sql, member.id, {
    boardId: input.boardId,
    fromNodeId: input.fromNodeId,
    idempotencyKey: input.idempotencyKey,
    scope: input.scope,
    steps,
  });
  if (created === null) {
    return refuse(404, "NOT_FOUND", NOT_FOUND);
  }
  return { ok: true, value: created };
};
