/**
 * What the canvas says about a node, worked out from the Board view alone:
 * its count line, whether it is running or Stale, the rows under its image,
 * and which Stale nodes a banner should offer to run. Plain functions, safe
 * in the browser and tested without one.
 */
import type {
  BoardViewData,
  NodeViewData,
  ResultViewData,
  RunViewData,
} from "@/lib/app/client/board-schemas";

import { NODE_LABELS, isRunnable, upstreamOf } from "./model";
import type { NodeKind } from "./model";

export interface Named {
  readonly id: string;
  readonly label: string;
}

export interface Vocabulary {
  readonly looks: readonly Named[];
  readonly moods: readonly Named[];
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** Every image a node has made, newest first. */
export const imagesOf = (
  node: NodeViewData
): readonly {
  readonly assetId: string;
  readonly url: string;
  readonly result: ResultViewData;
}[] =>
  node.results.flatMap((result) =>
    result.outputs.map((output) => ({ ...output, result }))
  );

const TERMINAL = new Set(["completed", "failed"]);

export type RunState =
  | { readonly state: "idle" }
  | {
      readonly state: "waiting" | "running";
      readonly run: RunViewData;
      /** When this node's own part began, for elapsed time. */
      readonly since: string;
      readonly typicalMs: number | null;
      readonly expected: number;
    };

/** Whether a run is working on this node now, waiting to reach it, or
 * neither. */
export const runStateOf = (
  view: BoardViewData,
  node: NodeViewData
): RunState => {
  const run = view.runs.find(
    (candidate) =>
      candidate.status === "running" && candidate.nodeIds.includes(node.id)
  );
  if (run === undefined) {
    return { state: "idle" };
  }
  const mine = node.results.filter((result) => result.runId === run.id);
  const expected = expectedImages(node);
  if (mine.length === 0) {
    return {
      expected,
      run,
      since: run.createdAt,
      state: run.nodeIds[0] === node.id ? "running" : "waiting",
      typicalMs: null,
    };
  }
  const models = node.kind === "compare" ? modelsOf(node).length : 1;
  const finished =
    mine.length >= models &&
    mine.every((result) => TERMINAL.has(result.status));
  if (finished) {
    return { state: "idle" };
  }
  let since = mine[0]?.createdAt ?? run.createdAt;
  let typicalMs: number | null = null;
  for (const result of mine) {
    if (result.createdAt < since) {
      since = result.createdAt;
    }
    if (result.typicalMs !== null) {
      typicalMs = Math.max(typicalMs ?? 0, result.typicalMs);
    }
  }
  return { expected, run, since, state: "running", typicalMs };
};

/** The Models a Compare node runs. */
export const modelsOf = (node: NodeViewData): readonly string[] =>
  node.kind === "compare" ? node.settings.models : [];

/** How many images one run of this node makes. */
export const expectedImages = (node: NodeViewData): number => {
  switch (node.kind) {
    case "compare": {
      return node.settings.models.length;
    }
    case "generate":
    case "vary": {
      return node.settings.count;
    }
    case "prompt":
    case "source":
    case "erase":
    case "reframe":
    case "cutout":
    case "upscale": {
      return 1;
    }
    default: {
      throw new TypeError("Unknown node kind.");
    }
  }
};

/** The short line at the right of a node's header. */
export const headerMeta = (
  node: NodeViewData,
  run: RunState
): { readonly text: string; readonly tone: "muted" | "warning" } | null => {
  if (run.state === "running") {
    return { text: "Running", tone: "muted" };
  }
  if (run.state === "waiting") {
    return { text: "Waiting", tone: "muted" };
  }
  if (node.stale) {
    return { text: "Stale", tone: "warning" };
  }
  if (node.kind === "source") {
    return node.pick === null ? null : { text: "Your photo", tone: "muted" };
  }
  if (node.kind === "compare") {
    const models = modelsOf(node).length;
    return models === 0
      ? null
      : {
          text: `${plural(models, "Model", "Models")}, 1 image each`,
          tone: "muted",
        };
  }
  const images = imagesOf(node).length;
  return images === 0
    ? null
    : { text: plural(images, "image", "images"), tone: "muted" };
};

const aspectLabel = (aspect: string | undefined): string =>
  aspect === undefined ? "From the Look" : aspect.replace(":", " : ");

const nameOf = (
  list: readonly Named[],
  id: string | undefined
): string | null =>
  id === undefined
    ? null
    : (list.find((entry) => entry.id === id)?.label ?? id);

export interface PropertyRow {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}

const TIER_LABEL = {
  balanced: "Balanced",
  fast: "Fast",
  quality: "Quality",
} as const;

/** A node that runs one Task, and so names a Model and a Tier. */
export type TaskNodeView = Extract<
  NodeViewData,
  { kind: "cutout" | "erase" | "generate" | "reframe" | "upscale" | "vary" }
>;

/** A node of one kind. */
export type NodeViewOf<K extends NodeViewData["kind"]> = Extract<
  NodeViewData,
  { kind: K }
>;

const modelRow = (node: TaskNodeView): PropertyRow => {
  const { model, tier } = node.settings;
  if (model !== undefined) {
    return { label: "Model", value: node.names[model] ?? model };
  }
  const latest = node.results[0];
  if (latest !== undefined) {
    return { label: "Model", value: latest.modelName };
  }
  return {
    label: "Model",
    value:
      tier === undefined
        ? "Motif’s choice"
        : `${TIER_LABEL[tier]}, Motif’s choice`,
  };
};

/** `1400 × 781`, when the Pick's size is known. */
const sizeOf = (node: NodeViewData): string | null => {
  const width = node.pick?.width ?? null;
  const height = node.pick?.height ?? null;
  return width === null || height === null ? null : `${width} × ${height}`;
};

const DETAIL_LABEL = {
  creative: "Creative",
  faithful: "Faithful",
  generative: "Generative",
} as const;

const sourceRows = (node: NodeViewOf<"source">): readonly PropertyRow[] => {
  const size = sizeOf(node);
  return [
    ...(node.settings.name === undefined
      ? []
      : [{ label: "File", mono: true, value: node.settings.name }]),
    ...(size === null ? [] : [{ label: "Size", mono: true, value: size }]),
  ];
};

const removeLabel = (node: NodeViewOf<"erase">): string => {
  if (node.settings.mode === "text") {
    return "All text";
  }
  const named = node.settings.prompt.trim();
  return named === "" ? "Not said yet" : named;
};

/** The rows under a node's image: what it was asked to do, in words. */
export const propertyRows = (
  node: NodeViewData,
  words: Vocabulary
): readonly PropertyRow[] => {
  switch (node.kind) {
    case "prompt": {
      return [
        {
          label: "Look",
          value: nameOf(words.looks, node.settings.look) ?? "None",
        },
        {
          label: "Mood",
          value: nameOf(words.moods, node.settings.mood) ?? "None",
        },
      ];
    }
    case "source": {
      return sourceRows(node);
    }
    case "generate": {
      return [
        modelRow(node),
        { label: "Aspect", value: aspectLabel(node.settings.aspect) },
      ];
    }
    case "vary": {
      const change = node.settings.prompt.trim();
      return [
        modelRow(node),
        {
          label: "Change",
          value: change === "" ? "Close to the original" : change,
        },
      ];
    }
    case "erase": {
      return [{ label: "Remove", value: removeLabel(node) }, modelRow(node)];
    }
    case "reframe": {
      return [
        { label: "Aspect", value: aspectLabel(node.settings.aspect) },
        modelRow(node),
      ];
    }
    case "cutout": {
      return [modelRow(node)];
    }
    case "upscale": {
      const size = sizeOf(node);
      return [
        {
          label: "Size",
          mono: size !== null,
          value: size ?? `${node.settings.scale}×`,
        },
        { label: "Detail", value: DETAIL_LABEL[node.settings.detail] },
      ];
    }
    case "compare": {
      return [{ label: "Aspect", value: aspectLabel(node.settings.aspect) }];
    }
    default: {
      throw new TypeError("Unknown node kind.");
    }
  }
};

/**
 * The Stale nodes a banner offers to run: those with nothing Stale feeding
 * them, so one "Run from" catches everything below. Named in the order they
 * sit on the Board, left to right.
 */
export const staleRoots = (view: BoardViewData): readonly NodeViewData[] => {
  const stale = new Set<string>();
  for (const node of view.nodes) {
    if (node.stale) {
      stale.add(node.id);
    }
  }
  return view.nodes
    .filter((node) => {
      if (!node.stale || !isRunnable(node.kind)) {
        return false;
      }
      let parent = upstreamOf(node.id, view.wires);
      while (parent !== null) {
        if (stale.has(parent)) {
          return false;
        }
        parent = upstreamOf(parent, view.wires);
      }
      return true;
    })
    .toSorted((a, b) => a.x - b.x);
};

/** "Erase and Upscale are stale", naming every Stale node once. */
export const staleTitle = (view: BoardViewData): string | null => {
  const names = view.nodes
    .filter((node) => node.stale)
    .toSorted((a, b) => a.x - b.x)
    .map((node) => NODE_LABELS[node.kind]);
  const unique = [...new Set(names)];
  if (unique.length === 0) {
    return null;
  }
  if (unique.length === 1) {
    return `${unique[0] ?? ""} is stale`;
  }
  const last = unique.at(-1) ?? "";
  return `${unique.slice(0, -1).join(", ")} and ${last} are stale`;
};

/** Widths and image heights from the Paper boards. */
export const NODE_WIDTH: Readonly<Record<NodeKind, number>> = {
  compare: 880,
  cutout: 232,
  erase: 232,
  generate: 272,
  prompt: 232,
  reframe: 232,
  source: 232,
  upscale: 216,
  vary: 272,
};

export const IMAGE_HEIGHT: Readonly<Record<NodeKind, number>> = {
  compare: 0,
  cutout: 131,
  erase: 131,
  generate: 153,
  prompt: 0,
  reframe: 150,
  source: 131,
  upscale: 122,
  vary: 153,
};

export const LABEL_WIDTH: Readonly<Partial<Record<NodeKind, number>>> = {
  prompt: 56,
  reframe: 60,
};

/** How wide a node is drawn; Compare grows with its Models, three a row. */
export const nodeWidth = (kind: NodeKind, node?: NodeViewData): number => {
  if (kind !== "compare" || node === undefined) {
    return NODE_WIDTH[kind];
  }
  const columns = Math.min(Math.max(modelsOf(node).length, 2), 3);
  return 32 + columns * 272 + (columns - 1) * 16;
};

/** Whether any run on the Board is still going. */
export const isRunning = (view: BoardViewData | undefined): boolean =>
  view?.runs.some((run) => run.status === "running") ?? false;
