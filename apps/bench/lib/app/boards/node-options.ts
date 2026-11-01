/** Model choices for the existing Board inspector. */
import { TASKS } from "@howells/motif-sdk";
import type { AppSql } from "@motif/bench-db/app-sql";

import { BOUNDED_GENERATION_MODELS } from "../budget/bounds";
import { chosenModel, isRunnable, isTaskKind, withModel } from "./model";
import type { KindSettings, NodeKind } from "./model";
import { modelName } from "./names";
import { inputFor, pickSizes, quoteNode } from "./plan";
import type { StepQuote } from "./plan";
import { refuse } from "./service";
import type { Outcome } from "./service";
import { getGraph, getOwnedNode } from "./store";

// ── Model choices ─────────────────────────────────────────────────────

export interface ModelChoice {
  readonly chosen: boolean;
  readonly listMicros: number | null;
  readonly model: string;
  readonly name: string;
  readonly reason: string | null;
  readonly tier: string;
  /** Billed by usage: priced at a fixed hold per image. */
  readonly usage: boolean;
}

export interface NodeOptions {
  readonly motifChoice: string | null;
  readonly models: readonly ModelChoice[];
}

const RANKED_LIMIT = 8;

const usageOf = (quoted: StepQuote): boolean => quoted.ok && quoted.usage;

/** The Models a node of this kind could ask, best ranked first. Compare
 * offers only Models with a listed price, so its holds are ceilings. */
const candidatesFor = (
  kind: NodeKind,
  mode: "describe" | "text" | undefined
): readonly { readonly model: string; readonly tier: string }[] => {
  if (kind === "compare") {
    return BOUNDED_GENERATION_MODELS.map((model) => ({
      model,
      tier:
        TASKS.generate.models.find((entry) => entry.model === model)?.tier ??
        "balanced",
    }));
  }
  if (!isTaskKind(kind)) {
    return [];
  }
  const wanted = kind === "erase" && mode === "text" ? "text" : undefined;
  const found: { model: string; tier: string }[] = [];
  for (const entry of TASKS[kind].models) {
    if (("mode" in entry ? entry.mode : undefined) === wanted) {
      found.push({ model: entry.model, tier: entry.tier });
    }
  }
  return found;
};

/**
 * The Models a node could use, best ranked first, each priced on the node's
 * real inputs. Motif's own choice (from the Tier, or the Look) is marked;
 * a Model the person picks overrides it.
 */
export const nodeOptions = async (
  sql: AppSql,
  ownerId: string,
  nodeId: string
): Promise<Outcome<NodeOptions>> => {
  const node = await getOwnedNode(sql, ownerId, nodeId);
  if (node === null || !isRunnable(node.kind)) {
    return refuse(404, "NOT_FOUND", "That node isn't on one of your Boards.");
  }
  const graph = await getGraph(sql, ownerId, node.boardId);
  const sizes = await pickSizes(sql, ownerId, graph);
  const input = inputFor(node, graph, sizes);
  const motif = quoteNode(
    { ...node, ...withModel(node) },
    input,
    ownerId,
    sizes
  );
  const motifChoice = motif.ok ? (motif.models[0] ?? null) : null;
  const candidates = candidatesFor(
    node.kind,
    node.kind === "erase" ? node.settings.mode : undefined
  );
  const compared = new Set(node.kind === "compare" ? node.settings.models : []);
  const current = chosenModel(node);
  const seen = new Set<string>();
  const models: ModelChoice[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.model) || models.length >= RANKED_LIMIT) {
      continue;
    }
    seen.add(candidate.model);
    const asked: KindSettings =
      node.kind === "compare"
        ? {
            kind: "generate",
            settings: {
              ...(node.settings.aspect !== undefined && {
                aspect: node.settings.aspect,
              }),
              count: 1,
              model: candidate.model,
              references: [],
            },
          }
        : withModel(node, candidate.model);
    const priced = quoteNode({ ...node, ...asked }, input, ownerId, sizes);
    models.push({
      chosen:
        node.kind === "compare"
          ? compared.has(candidate.model)
          : current === candidate.model,
      listMicros: priced.ok ? priced.listMicros : null,
      model: candidate.model,
      name: modelName(candidate.model),
      reason: priced.ok ? null : priced.reason,
      tier: candidate.tier,
      usage: usageOf(priced),
    });
  }
  return { ok: true, value: { models, motifChoice } };
};
