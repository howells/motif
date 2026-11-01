import type { AppSql } from "@motif/bench-db/app-sql";
/**
 * From a node on a Board to the Task request it stands for, and from a run
 * of nodes to one combined price.
 *
 * A node's request is built from its own settings and what is wired into it:
 * a Prompt's text, Look and Mood, or another node's Pick. When the Pick will
 * only exist once an earlier step of the same run has finished, the price is
 * worked out on an estimated size, kept on the high side; each step is
 * priced again on its real image before anything is held, and a run stops
 * rather than hold more than was approved.
 */
import type { z } from "zod";

import { getOwnedAssets } from "../media/assets";
import type { Asset } from "../media/assets";
import { quote } from "../tasks/plan";
import type { Alternative, OwnedInputs } from "../tasks/plan";
import { TaskRequestSchema } from "../tasks/request";
import type { AppTaskRequest } from "../tasks/request";
import { NODE_LABELS, runLevels, upstreamOf } from "./model";
import type { BoardTier, KindSettings, NodeKind, RunScope } from "./model";
import { modelName } from "./names";
import type { BoardNode, Graph } from "./store";

export interface Size {
  readonly height: number;
  readonly width: number;
}

/** What feeds a node, as far as is known before it runs. */
export type NodeInput =
  | { readonly kind: "none" }
  | {
      readonly kind: "text";
      readonly prompt: string;
      readonly look?: string;
      readonly mood?: string;
    }
  | {
      readonly kind: "image";
      readonly assetId: string;
      readonly size: Size;
      /** True when the image is made earlier in the same run. */
      readonly pending: boolean;
    };

/** Stands in for an image a run hasn't made yet. Never stored or fetched. */
export const PENDING_ASSET_ID = `ast_${"0".repeat(32)}`;

/** The longest edge assumed for an image a run will make, on the high side
 * of what the App's Models return, so an estimate is a ceiling. */
const ESTIMATE_EDGE = 2048;

const ratioOf = (aspect: string | undefined): number => {
  const [w, h] = (aspect ?? "1:1").split(":").map(Number);
  return w !== undefined && h !== undefined && w > 0 && h > 0 ? w / h : 1;
};

const sizeForAspect = (aspect: string | undefined, edge: number): Size => {
  const ratio = ratioOf(aspect);
  return ratio >= 1
    ? { height: Math.round(edge / ratio), width: edge }
    : { height: edge, width: Math.round(edge * ratio) };
};

/** The size a node's result will have, given the size of what feeds it. */
export const estimateOutput = (
  node: KindSettings,
  input: Size | null
): Size | null => {
  switch (node.kind) {
    case "generate":
    case "compare": {
      return sizeForAspect(node.settings.aspect, ESTIMATE_EDGE);
    }
    case "vary":
    case "erase":
    case "cutout":
    case "prompt":
    case "source": {
      return input;
    }
    case "reframe": {
      return input === null
        ? null
        : sizeForAspect(
            node.settings.aspect,
            Math.max(input.width, input.height)
          );
    }
    case "upscale": {
      const { scale } = node.settings;
      return input === null
        ? null
        : { height: input.height * scale, width: input.width * scale };
    }
    default: {
      throw new TypeError("Unknown node kind.");
    }
  }
};

/** Why a node can't be turned into a request yet, or its request. */
export type Built =
  | { readonly ok: true; readonly requests: readonly AppTaskRequest[] }
  | { readonly ok: false; readonly reason: string };

const KEY_PLACEHOLDER = "00000000-0000-4000-8000-000000000000";

/** A Task request as a node builds it, before its idempotency key. */
type RequestDraft =
  z.input<typeof TaskRequestSchema> extends infer R
    ? R extends unknown
      ? Omit<R, "idempotencyKey">
      : never
    : never;

const parsed = (request: RequestDraft): Built => {
  const result = TaskRequestSchema.safeParse({
    idempotencyKey: KEY_PLACEHOLDER,
    ...request,
  });
  return result.success
    ? { ok: true, requests: [result.data] }
    : {
        ok: false,
        reason: result.error.issues[0]?.message ?? "That node isn't ready.",
      };
};

const choice = (settings: { model?: string; tier?: BoardTier }) => ({
  ...(settings.model !== undefined && { model: settings.model }),
  ...(settings.tier !== undefined && { tier: settings.tier }),
});

const needsImage = (kind: NodeKind): string =>
  `${NODE_LABELS[kind]} needs an image wired in: a Source, or a node that makes one.`;

const fromText = (
  node: Extract<KindSettings, { kind: "compare" | "generate" }>,
  input: NodeInput
): Built => {
  if (input.kind !== "text") {
    return {
      ok: false,
      reason: `Wire a Prompt into ${NODE_LABELS[node.kind]}.`,
    };
  }
  if (input.prompt.trim() === "") {
    return { ok: false, reason: "Write the Prompt first." };
  }
  const creative = {
    ...(input.look !== undefined && { look: input.look }),
    ...(input.mood !== undefined && { mood: input.mood }),
  };
  if (node.kind === "compare") {
    const { aspect, models } = node.settings;
    if (models.length < 2) {
      return { ok: false, reason: "Choose at least two Models to compare." };
    }
    const requests: AppTaskRequest[] = [];
    for (const model of models) {
      const built = parsed({
        ...creative,
        ...(aspect !== undefined && { aspect }),
        count: 1,
        model,
        prompt: input.prompt,
        task: "generate",
      });
      if (!built.ok) {
        return built;
      }
      requests.push(...built.requests);
    }
    return { ok: true, requests };
  }
  const generate = node.settings;
  return parsed({
    ...creative,
    ...choice(generate),
    ...(generate.aspect !== undefined && { aspect: generate.aspect }),
    count: generate.count,
    prompt: input.prompt,
    referenceAssetIds: generate.references,
    task: "generate",
  });
};

const fromImage = (
  node: Extract<
    KindSettings,
    { kind: "cutout" | "erase" | "reframe" | "upscale" | "vary" }
  >,
  sourceAssetId: string
): Built => {
  switch (node.kind) {
    case "vary": {
      const vary = node.settings;
      return parsed({
        ...choice(vary),
        count: vary.count,
        ...(vary.prompt.trim() !== "" && { prompt: vary.prompt }),
        sourceAssetId,
        task: "vary",
      });
    }
    case "erase": {
      const erase = node.settings;
      if (erase.mode === "text") {
        return parsed({
          ...choice(erase),
          mode: "text",
          sourceAssetId,
          task: "erase",
        });
      }
      if (erase.prompt.trim() === "") {
        return { ok: false, reason: "Say what Erase should remove." };
      }
      return parsed({
        ...choice(erase),
        mode: "describe",
        prompt: erase.prompt,
        sourceAssetId,
        task: "erase",
      });
    }
    case "reframe": {
      return parsed({
        ...choice(node.settings),
        aspect: node.settings.aspect,
        mode: "ratio",
        sourceAssetId,
        task: "reframe",
      });
    }
    case "cutout": {
      return parsed({
        ...choice(node.settings),
        sourceAssetId,
        task: "cutout",
      });
    }
    case "upscale": {
      return parsed({
        ...choice(node.settings),
        detail: node.settings.detail,
        scale: node.settings.scale,
        sourceAssetId,
        task: "upscale",
      });
    }
    default: {
      throw new TypeError("Unknown image Task.");
    }
  }
};

/** The Task requests a node stands for (one per Model for Compare). The
 * idempotency key is a placeholder; a run sets its own. */
export const buildRequests = (node: KindSettings, input: NodeInput): Built => {
  switch (node.kind) {
    case "prompt":
    case "source": {
      return {
        ok: false,
        reason: `${NODE_LABELS[node.kind]} has nothing to run.`,
      };
    }
    case "generate":
    case "compare": {
      return fromText(node, input);
    }
    case "vary":
    case "erase":
    case "reframe":
    case "cutout":
    case "upscale": {
      return input.kind === "image"
        ? fromImage(node, input.assetId)
        : { ok: false, reason: needsImage(node.kind) };
    }
    default: {
      throw new TypeError("Unknown node kind.");
    }
  }
};

// ── Inputs ────────────────────────────────────────────────────────────

const textInput = (prompt: BoardNode): NodeInput => {
  if (prompt.kind !== "prompt") {
    return { kind: "none" };
  }
  const { look, mood, text } = prompt.settings;
  return {
    kind: "text",
    prompt: text,
    ...(look !== undefined && look !== "" && { look }),
    ...(mood !== undefined && mood !== "" && { mood }),
  };
};

/**
 * What feeds a node right now: a Prompt's text, or the Pick of the node
 * wired in. `planned` names the nodes an earlier step of this run will make
 * an image for, with the size it is expected to have.
 */
export const inputFor = (
  node: BoardNode,
  graph: Graph,
  sizes: ReadonlyMap<string, Size>,
  planned: ReadonlyMap<string, Size> = new Map()
): NodeInput => {
  const upstreamId = upstreamOf(node.id, graph.wires);
  const upstream =
    upstreamId === null
      ? undefined
      : graph.nodes.find((candidate) => candidate.id === upstreamId);
  if (upstream === undefined) {
    return { kind: "none" };
  }
  if (upstream.kind === "prompt") {
    return textInput(upstream);
  }
  const plannedSize = planned.get(upstream.id);
  if (plannedSize !== undefined) {
    return {
      assetId: PENDING_ASSET_ID,
      kind: "image",
      pending: true,
      size: plannedSize,
    };
  }
  if (upstream.pickAssetId === null) {
    return { kind: "none" };
  }
  const size = sizes.get(upstream.pickAssetId);
  return size === undefined
    ? { kind: "none" }
    : { assetId: upstream.pickAssetId, kind: "image", pending: false, size };
};

/** A Generate node's Reference images. */
const referencesOf = (node: KindSettings): readonly string[] =>
  node.kind === "generate" ? node.settings.references : [];

/** The sizes of every Pick on a Board, read from the owner's assets. */
export const pickSizes = async (
  sql: AppSql,
  ownerId: string,
  graph: Graph
): Promise<Map<string, Size>> => {
  const ids = [
    ...new Set(
      graph.nodes.flatMap((node) => [
        ...(node.pickAssetId === null ? [] : [node.pickAssetId]),
        ...referencesOf(node),
      ])
    ),
  ];
  const assets = (await getOwnedAssets(sql, ownerId, ids)) ?? [];
  return new Map(
    assets.map((asset) => [
      asset.id,
      { height: asset.height, width: asset.width },
    ])
  );
};

// ── Quotes ────────────────────────────────────────────────────────────

const syntheticAsset = (id: string, ownerId: string, size: Size): Asset => ({
  blobPathname: "",
  bytes: 1,
  contentType: "image/png",
  createdAt: new Date(0),
  height: size.height,
  id,
  kind: "output",
  ownerId,
  width: size.width,
});

const inputsFor = (
  input: NodeInput,
  ownerId: string,
  references: readonly Asset[]
): OwnedInputs => ({
  mask: null,
  parent: null,
  references,
  source:
    input.kind === "image"
      ? syntheticAsset(input.assetId, ownerId, input.size)
      : null,
});

export type StepQuote =
  | {
      readonly ok: true;
      readonly nodeId: string;
      readonly kind: NodeKind;
      readonly label: string;
      readonly detail: string;
      readonly listMicros: number;
      readonly micros: number;
      readonly models: readonly string[];
      readonly estimated: boolean;
    }
  | {
      readonly ok: false;
      readonly nodeId: string;
      readonly kind: NodeKind;
      readonly label: string;
      readonly reason: string;
      readonly alternatives: readonly (Alternative & {
        readonly name: string;
      })[];
    };

const imagesText = (count: number): string =>
  count > 1 ? `, ${count} images` : ", 1 image";

const detailOf = (
  node: KindSettings,
  models: readonly string[],
  input: NodeInput,
  output: Size | null
): string => {
  const names = models.map((model) => modelName(model));
  const first = names[0] ?? "";
  switch (node.kind) {
    case "generate":
    case "vary": {
      return `${first}${imagesText(node.settings.count)}`;
    }
    case "compare": {
      return names.join(", ");
    }
    case "upscale": {
      const { scale } = node.settings;
      return output === null
        ? `${first}, ${scale}×`
        : `${first}, ${scale}× to ${output.width} × ${output.height}`;
    }
    case "reframe": {
      return `${first}, to ${node.settings.aspect}`;
    }
    case "erase":
    case "cutout": {
      return input.kind === "image" && input.pending
        ? `${first}, on the new Pick`
        : first;
    }
    case "prompt":
    case "source": {
      return "";
    }
    default: {
      throw new TypeError("Unknown node kind.");
    }
  }
};

/** Price one node with the inputs it would have. Spends nothing. */
export const quoteNode = (
  node: BoardNode,
  input: NodeInput,
  ownerId: string,
  sizes: ReadonlyMap<string, Size> = new Map()
): StepQuote => {
  const label = NODE_LABELS[node.kind];
  const references = referencesOf(node).map((id) =>
    syntheticAsset(
      id,
      ownerId,
      sizes.get(id) ?? { height: ESTIMATE_EDGE, width: ESTIMATE_EDGE }
    )
  );
  const built = buildRequests(node, input);
  if (!built.ok) {
    return {
      alternatives: [],
      kind: node.kind,
      label,
      nodeId: node.id,
      ok: false,
      reason: built.reason,
    };
  }
  let micros = 0;
  let listMicros = 0;
  const models: string[] = [];
  for (const request of built.requests) {
    const quoted = quote(request, inputsFor(input, ownerId, references));
    if (quoted.kind === "invalid") {
      return {
        alternatives: [],
        kind: node.kind,
        label,
        nodeId: node.id,
        ok: false,
        reason: quoted.message,
      };
    }
    if (quoted.kind === "blocked") {
      const blockedModel = quoted.plan.model;
      return {
        alternatives: quoted.alternatives.map((alternative) => ({
          ...alternative,
          name: modelName(alternative.model),
        })),
        kind: node.kind,
        label,
        nodeId: node.id,
        ok: false,
        reason: quoted.reason.replaceAll(blockedModel, modelName(blockedModel)),
      };
    }
    micros += quoted.bound.micros;
    listMicros += quoted.bound.listMicros;
    models.push(quoted.plan.model);
  }
  const output = estimateOutput(
    node,
    input.kind === "image" ? input.size : null
  );
  return {
    detail: detailOf(node, models, input, output),
    estimated: input.kind === "image" && input.pending,
    kind: node.kind,
    label,
    listMicros,
    micros,
    models,
    nodeId: node.id,
    ok: true,
  };
};

export interface RunQuote {
  readonly levels: readonly (readonly string[])[];
  readonly steps: readonly StepQuote[];
  readonly ready: boolean;
  readonly listMicros: number;
  readonly micros: number;
}

/**
 * Price a run: one node, or a node and everything that spends below it, in
 * the order it would run. Each step sees what the steps before it will
 * make, on an estimated size.
 */
export const quoteRun = (
  graph: Graph,
  fromNodeId: string,
  scope: RunScope,
  sizes: ReadonlyMap<string, Size>,
  ownerId: string
): RunQuote => {
  const levels = runLevels(fromNodeId, scope, graph.nodes, graph.wires);
  const planned = new Map<string, Size>();
  const steps: StepQuote[] = [];
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const level of levels) {
    const made: [string, Size][] = [];
    for (const id of level) {
      const node = byId.get(id);
      if (node === undefined) {
        continue;
      }
      const input = inputFor(node, graph, sizes, planned);
      steps.push(quoteNode(node, input, ownerId, sizes));
      const output = estimateOutput(
        node,
        input.kind === "image" ? input.size : null
      );
      if (output !== null) {
        made.push([id, output]);
      }
    }
    for (const [id, size] of made) {
      planned.set(id, size);
    }
  }
  const ready = steps.length > 0 && steps.every((step) => step.ok);
  return {
    levels,
    listMicros: steps.reduce(
      (sum, step) => sum + (step.ok ? step.listMicros : 0),
      0
    ),
    micros: steps.reduce((sum, step) => sum + (step.ok ? step.micros : 0), 0),
    ready,
    steps,
  };
};
