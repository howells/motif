/**
 * What the browser is told about a Board: its nodes with their results and
 * Picks, its wires, and its latest runs. Media is named by same-origin URLs
 * the media route checks; nothing here carries a provider URL or a Blob path.
 */
import type { Generation } from "../tasks/store";
import { mediaUrl } from "../views";
import { chosenModel, kindAndSettings } from "./model";
import type { KindSettings, RunScope } from "./model";
import { modelName, typicalMs } from "./names";
import type { Size } from "./plan";
import type { BoardRun } from "./run-store";
import type { Board, BoardNode, BoardWire } from "./store";

export interface ResultView {
  readonly completedAt: string | null;
  /** The cost is the hold, counted because fal reported none. */
  readonly costEstimated: boolean;
  /** What the run counts against the cap: the recorded cost, or the hold
   * when the cost is an estimate. */
  readonly costMicros: number | null;
  readonly createdAt: string;
  readonly elapsedMs: number | null;
  readonly error: string | null;
  readonly generationId: string;
  readonly model: string;
  readonly modelName: string;
  readonly outputs: readonly {
    readonly assetId: string;
    readonly url: string;
  }[];
  readonly runId: string | null;
  readonly status: Generation["status"];
  /** How long the Model usually takes, for a running result. */
  readonly typicalMs: number | null;
}

export interface PickView {
  readonly assetId: string;
  readonly height: number | null;
  readonly url: string;
  readonly width: number | null;
}

/** What running this node alone would cost, or why it can't run yet. */
export type PriceView =
  | {
      readonly ok: true;
      readonly listMicros: number;
      readonly detail: string;
      /** Billed by usage: the price is a fixed hold per image. */
      readonly usage: boolean;
    }
  | { readonly ok: false; readonly reason: string };

interface NodeViewBase {
  readonly id: string;
  /** Display names for the Models its settings name. */
  readonly names: Readonly<Record<string, string>>;
  readonly pick: PickView | null;
  readonly price: PriceView | null;
  /** Newest first. */
  readonly results: readonly ResultView[];
  readonly stale: boolean;
  readonly x: number;
  readonly y: number;
}

/** A node as the canvas draws it, its settings typed by its kind. */
export type NodeView = NodeViewBase & KindSettings;

export interface RunView {
  readonly createdAt: string;
  readonly error: string | null;
  readonly fromNodeId: string;
  readonly id: string;
  readonly nodeIds: readonly string[];
  readonly scope: RunScope;
  readonly status: BoardRun["status"];
}

export interface BoardView {
  readonly board: {
    readonly id: string;
    readonly kind: Board["kind"];
    readonly name: string;
  };
  readonly nodes: readonly NodeView[];
  readonly runs: readonly RunView[];
  readonly wires: readonly {
    readonly from: string;
    readonly id: string;
    readonly to: string;
  }[];
}

export const resultView = (
  generation: Generation,
  runId: string | null
): ResultView => ({
  completedAt: generation.completedAt?.toISOString() ?? null,
  costEstimated: generation.costStatus === "retained",
  costMicros:
    generation.costStatus === "retained"
      ? generation.boundMicros
      : generation.costMicros,
  createdAt: generation.createdAt.toISOString(),
  elapsedMs: generation.providerMs,
  error:
    generation.errorCode === null
      ? null
      : (generation.errorMessage ?? "The run failed."),
  generationId: generation.id,
  model: generation.model,
  modelName: modelName(generation.model),
  outputs: generation.outputAssetIds.map((assetId) => ({
    assetId,
    url: mediaUrl(assetId),
  })),
  runId,
  status: generation.status,
  typicalMs: typicalMs(generation.model),
});

export const runView = (run: BoardRun): RunView => ({
  createdAt: run.createdAt.toISOString(),
  error: run.errorMessage,
  fromNodeId: run.fromNodeId,
  id: run.id,
  nodeIds: run.steps.map((step) => step.nodeId),
  scope: run.scope,
  status: run.status,
});

const namedModels = (node: KindSettings): Record<string, string> => {
  const chosen = chosenModel(node);
  const ids = [
    ...(chosen === null ? [] : [chosen]),
    ...(node.kind === "compare" ? node.settings.models : []),
  ];
  return Object.fromEntries(ids.map((id) => [id, modelName(id)]));
};

export const boardView = (input: {
  readonly board: Board;
  readonly nodes: readonly BoardNode[];
  readonly wires: readonly BoardWire[];
  readonly prices: ReadonlyMap<string, PriceView>;
  readonly results: ReadonlyMap<string, readonly ResultView[]>;
  readonly sizes: ReadonlyMap<string, Size>;
  readonly runs: readonly BoardRun[];
}): BoardView => ({
  board: { id: input.board.id, kind: input.board.kind, name: input.board.name },
  nodes: input.nodes.map((node) => {
    const size =
      node.pickAssetId === null ? undefined : input.sizes.get(node.pickAssetId);
    return {
      ...kindAndSettings(node),
      id: node.id,
      names: namedModels(node),
      pick:
        node.pickAssetId === null
          ? null
          : {
              assetId: node.pickAssetId,
              height: size?.height ?? null,
              url: mediaUrl(node.pickAssetId),
              width: size?.width ?? null,
            },
      price: input.prices.get(node.id) ?? null,
      results: input.results.get(node.id) ?? [],
      stale: node.stale,
      x: node.x,
      y: node.y,
    };
  }),
  runs: [...input.runs]
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((run) => runView(run)),
  wires: input.wires.map((wire) => ({
    from: wire.from,
    id: wire.id,
    to: wire.to,
  })),
});
