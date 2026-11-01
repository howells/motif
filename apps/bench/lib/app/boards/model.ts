/**
 * What a Board is made of, shared by the canvas and the server: the kinds of
 * node, what each one asks for, and which wires make sense.
 *
 * Everything here is plain data and Zod, safe in the browser. The server
 * validates every write against these same schemas, then checks the parts
 * only it can know (that a Look exists, that an image is the person's own).
 */
import { z } from "zod";

/** Ratios offered on the canvas, in the order the boards draw them. The
 * server's Task schema uses the same list. */
export const BOARD_ASPECTS = [
  "1:1",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
] as const;
export type BoardAspect = (typeof BOARD_ASPECTS)[number];

export const BOARD_TIERS = ["quality", "balanced", "fast"] as const;
export type BoardTier = (typeof BOARD_TIERS)[number];

/** The Tasks a node can run. Only Tasks the App can hold a price for. */
export const TASK_KINDS = [
  "generate",
  "vary",
  "erase",
  "reframe",
  "cutout",
  "upscale",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const NODE_KINDS = [
  "prompt",
  "source",
  ...TASK_KINDS,
  "compare",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

const NODE_KIND_SET: ReadonlySet<string> = new Set(NODE_KINDS);
const TASK_KIND_SET: ReadonlySet<string> = new Set(TASK_KINDS);

export const isNodeKind = (value: string): value is NodeKind =>
  NODE_KIND_SET.has(value);

export const isTaskKind = (kind: NodeKind): kind is TaskKind =>
  TASK_KIND_SET.has(kind);

/** Nodes that spend: a Task, or Compare. */
export const isRunnable = (kind: NodeKind): boolean =>
  kind === "compare" || isTaskKind(kind);

/** The name a node goes by, always in title case. */
export const NODE_LABELS: Readonly<Record<NodeKind, string>> = {
  compare: "Compare",
  cutout: "Cutout",
  erase: "Erase",
  generate: "Generate",
  prompt: "Prompt",
  reframe: "Reframe",
  source: "Source",
  upscale: "Upscale",
  vary: "Vary",
};

const MAX_IMAGES = 4;
const MAX_REFERENCES = 4;
export const MAX_COMPARE_MODELS = 6;

const modelId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]{0,63}$/u)
  .optional();
const tier = z.enum(BOARD_TIERS).optional();
const assetId = z.string().regex(/^ast_[0-9a-f]{32}$/u);

export const NODE_SETTINGS = {
  compare: z.strictObject({
    aspect: z.enum(BOARD_ASPECTS).optional(),
    models: z.array(modelId.unwrap()).max(MAX_COMPARE_MODELS).default([]),
  }),
  cutout: z.strictObject({ model: modelId, tier }),
  erase: z.strictObject({
    mode: z.enum(["describe", "text"]).default("describe"),
    model: modelId,
    prompt: z.string().max(500).default(""),
    tier,
  }),
  generate: z.strictObject({
    aspect: z.enum(BOARD_ASPECTS).optional(),
    count: z.int().min(1).max(MAX_IMAGES).default(1),
    model: modelId,
    references: z.array(assetId).max(MAX_REFERENCES).default([]),
    tier,
  }),
  prompt: z.strictObject({
    look: z.string().max(64).optional(),
    mood: z.string().max(64).optional(),
    text: z.string().max(4000).default(""),
  }),
  reframe: z.strictObject({
    aspect: z.enum(BOARD_ASPECTS).default("1:1"),
    model: modelId,
    tier,
  }),
  source: z.strictObject({
    assetId: assetId.optional(),
    name: z.string().max(200).optional(),
  }),
  upscale: z.strictObject({
    detail: z.enum(["faithful", "generative", "creative"]).default("faithful"),
    model: modelId,
    scale: z.union([z.literal(2), z.literal(4)]).default(2),
    tier,
  }),
  vary: z.strictObject({
    count: z.int().min(1).max(MAX_IMAGES).default(1),
    model: modelId,
    prompt: z.string().max(4000).default(""),
    tier,
  }),
} as const;

export type NodeSettings = {
  [K in NodeKind]: z.output<(typeof NODE_SETTINGS)[K]>;
};

/** A node's kind together with its settings, read with that kind's schema:
 * branch on `kind` and the settings are typed for it. */
export type KindSettings = {
  [K in NodeKind]: { readonly kind: K; readonly settings: NodeSettings[K] };
}[NodeKind];

/** One value a node's settings can hold. */
export type SettingValue = boolean | number | string | readonly string[];

/** A change to a node's settings: a value sets it, `undefined` clears it. */
export type SettingsPatch = Readonly<Record<string, SettingValue | undefined>>;

/** Settings as they arrive, from a request or a stored row, before the
 * node's kind reads them: plain values under names. */
export type SettingsInput = SettingsPatch;

export const SettingsInputSchema = z.record(
  z.string(),
  z.union([z.boolean(), z.number(), z.string(), z.array(z.string())])
);

export type SettingsRead =
  | { readonly ok: true; readonly node: KindSettings }
  | { readonly ok: false; readonly message: string };

const failed = (error: z.ZodError): SettingsRead => {
  const issue = error.issues[0];
  const where =
    issue === undefined || issue.path.length === 0
      ? ""
      : ` (${issue.path.join(".")})`;
  return {
    message: `${issue?.message ?? "Those settings aren't valid."}${where}`,
    ok: false,
  };
};

const readAs = <K extends NodeKind>(
  kind: K,
  schema: z.ZodType<NodeSettings[K]>,
  value: SettingsInput
):
  | {
      readonly ok: true;
      readonly node: { readonly kind: K; readonly settings: NodeSettings[K] };
    }
  | SettingsRead => {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { node: { kind, settings: parsed.data }, ok: true }
    : failed(parsed.error);
};

/** Parse a node's settings for its kind, filling defaults. Everything that
 * reads settings, from the database or a request, comes through here. */
export const parseSettings = (
  kind: NodeKind,
  value: SettingsInput = {}
): SettingsRead => {
  switch (kind) {
    case "prompt": {
      return readAs(kind, NODE_SETTINGS.prompt, value);
    }
    case "source": {
      return readAs(kind, NODE_SETTINGS.source, value);
    }
    case "generate": {
      return readAs(kind, NODE_SETTINGS.generate, value);
    }
    case "vary": {
      return readAs(kind, NODE_SETTINGS.vary, value);
    }
    case "erase": {
      return readAs(kind, NODE_SETTINGS.erase, value);
    }
    case "reframe": {
      return readAs(kind, NODE_SETTINGS.reframe, value);
    }
    case "cutout": {
      return readAs(kind, NODE_SETTINGS.cutout, value);
    }
    case "upscale": {
      return readAs(kind, NODE_SETTINGS.upscale, value);
    }
    case "compare": {
      return readAs(kind, NODE_SETTINGS.compare, value);
    }
    default: {
      throw new TypeError("Unknown node kind.");
    }
  }
};

/** Just a node's kind and settings, copied out of a larger node, so nothing
 * else it carries travels with them. */
export const kindAndSettings = (node: KindSettings): KindSettings => {
  const read = parseSettings(node.kind, node.settings);
  if (!read.ok) {
    throw new TypeError(
      `Settings that once parsed no longer do: ${read.message}`
    );
  }
  return read.node;
};

/** The Model a node names, if it names one. */
export const chosenModel = (node: KindSettings): string | null =>
  node.kind === "prompt" || node.kind === "source" || node.kind === "compare"
    ? null
    : (node.settings.model ?? null);

/** The node with its Model set, or cleared to let Motif choose. Prompt,
 * Source and Compare name no single Model, so they come back as they are. */
export const withModel = (node: KindSettings, model?: string): KindSettings => {
  switch (node.kind) {
    case "prompt":
    case "source":
    case "compare": {
      return node;
    }
    case "generate": {
      return { kind: node.kind, settings: { ...node.settings, model } };
    }
    case "vary": {
      return { kind: node.kind, settings: { ...node.settings, model } };
    }
    case "erase": {
      return { kind: node.kind, settings: { ...node.settings, model } };
    }
    case "reframe": {
      return { kind: node.kind, settings: { ...node.settings, model } };
    }
    case "cutout": {
      return { kind: node.kind, settings: { ...node.settings, model } };
    }
    case "upscale": {
      return { kind: node.kind, settings: { ...node.settings, model } };
    }
    default: {
      throw new TypeError("Unknown node kind.");
    }
  }
};

/** What a node takes in through its one input. */
export type InputKind = "image" | "none" | "text";

export const inputOf = (kind: NodeKind): InputKind => {
  if (kind === "prompt" || kind === "source") {
    return "none";
  }
  return kind === "generate" || kind === "compare" ? "text" : "image";
};

/** What a node gives out. */
export const outputOf = (kind: NodeKind): "image" | "text" =>
  kind === "prompt" ? "text" : "image";

/** Whether a node has a result anyone can pick. */
export const makesImages = (kind: NodeKind): boolean =>
  outputOf(kind) === "image";

// ── Graph ─────────────────────────────────────────────────────────────

export interface GraphNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly pickAssetId: string | null;
  readonly stale: boolean;
}

export interface GraphWire {
  readonly id: string;
  readonly from: string;
  readonly to: string;
}

const childrenOf = (
  id: string,
  wires: readonly GraphWire[]
): readonly string[] => {
  const children: string[] = [];
  for (const wire of wires) {
    if (wire.from === id) {
      children.push(wire.to);
    }
  }
  return children;
};

/** Every node reachable downstream of `id`, nearest first, without `id`. */
export const downstreamOf = (
  id: string,
  wires: readonly GraphWire[]
): string[] => {
  const seen = new Set<string>([id]);
  const order: string[] = [];
  const queue = [...childrenOf(id, wires)];
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined || seen.has(next)) {
      continue;
    }
    seen.add(next);
    order.push(next);
    queue.push(...childrenOf(next, wires));
  }
  return order;
};

/** The node whose output feeds `id`, if one is wired in. */
export const upstreamOf = (
  id: string,
  wires: readonly GraphWire[]
): string | null => wires.find((wire) => wire.to === id)?.from ?? null;

/**
 * Why a wire from one node to another can't be made, or `null` when it can.
 * A node has one input; a wire must carry what the input takes; and a wire
 * may not make a loop.
 */
export const wireRefusal = (
  from: GraphNode,
  to: GraphNode,
  wires: readonly GraphWire[]
): string | null => {
  if (from.id === to.id) {
    return "A node can't feed itself.";
  }
  const input = inputOf(to.kind);
  if (input === "none") {
    return `${NODE_LABELS[to.kind]} doesn't take an input.`;
  }
  const output = outputOf(from.kind);
  if (input !== output) {
    return input === "text"
      ? `${NODE_LABELS[to.kind]} takes a Prompt.`
      : `${NODE_LABELS[to.kind]} takes an image, not text.`;
  }
  if (downstreamOf(to.id, wires).includes(from.id)) {
    return "That wire would make a loop.";
  }
  return null;
};

/**
 * Nodes to mark Stale when a node's settings change: the node itself if it
 * has a result, then every node downstream that has one. Nothing is spent;
 * a Stale node keeps its Pick until it runs again.
 */
export const staleAfterEdit = (
  id: string,
  nodes: readonly GraphNode[],
  wires: readonly GraphWire[]
): string[] => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const self = byId.get(id);
  const own =
    self !== undefined && isRunnable(self.kind) && self.pickAssetId !== null
      ? [id]
      : [];
  return [...own, ...staleAfterPick(id, nodes, wires)];
};

/** Nodes to mark Stale when a node's Pick changes: every downstream node
 * that has a result of its own. */
export const staleAfterPick = (
  id: string,
  nodes: readonly GraphNode[],
  wires: readonly GraphWire[]
): string[] => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return downstreamOf(id, wires).filter((child) => {
    const node = byId.get(child);
    return (
      node !== undefined && isRunnable(node.kind) && node.pickAssetId !== null
    );
  });
};

export type RunScope = "downstream" | "node";

/**
 * The order a run takes, as levels: every node in a level can run once the
 * levels before it have finished, so a level of several runs in parallel.
 *
 * `node` runs one node. `downstream` runs the node, if it spends, and every
 * node that spends below it. Prompt and Source nodes have nothing to run, so
 * they're never in a plan; starting from one runs what it feeds.
 */
export const runLevels = (
  fromId: string,
  scope: RunScope,
  nodes: readonly GraphNode[],
  wires: readonly GraphWire[]
): string[][] => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const start = byId.get(fromId);
  if (start === undefined) {
    return [];
  }
  if (scope === "node") {
    return isRunnable(start.kind) ? [[fromId]] : [];
  }
  const members = new Set([fromId, ...downstreamOf(fromId, wires)]);
  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) {
      return known;
    }
    const parent = upstreamOf(id, wires);
    const value =
      id === fromId || parent === null || !members.has(parent)
        ? 0
        : depthOf(parent) + 1;
    depth.set(id, value);
    return value;
  };
  const levels: string[][] = [];
  for (const id of members) {
    const node = byId.get(id);
    if (node === undefined || !isRunnable(node.kind)) {
      continue;
    }
    const level = depthOf(id);
    levels[level] = [...(levels[level] ?? []), id];
  }
  return levels.filter((level) => level.length > 0);
};
