/** Recover the immutable inputs approved for one Board run. */
import { getOwnedGenerations } from "../tasks/store";
import type { Generation } from "../tasks/store";
import type { RunContext } from "./run";
import { listRunResults } from "./run-store";
import type { BoardRun } from "./run-store";
import type { BoardNode, Graph } from "./store";

/** A run step failed in a way the person should read. */
export class StepFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StepFailedError";
  }
}

/** A Comparison uses its approved Model order, independent of completion
 * or database insertion order. Recovery and completion must pick identically. */
export const resultPick = (
  node: BoardNode,
  generations: readonly Pick<
    Generation,
    "model" | "status" | "outputAssetIds"
  >[]
): string | undefined => {
  const ordered =
    node.kind === "compare"
      ? node.settings.models.flatMap((model) =>
          generations.filter((generation) => generation.model === model)
        )
      : generations;
  return ordered.find(
    (generation) =>
      generation.status === "completed" && generation.outputAssetIds.length > 0
  )?.outputAssetIds[0];
};

/** Work always reads the approved graph. Only results made by this run
 * replace its input Picks, so later user edits never redirect paid steps. */
export const approvedGraph = async (ctx: RunContext): Promise<Graph> => {
  const snapshot = ctx.run.steps[0]?.snapshot;
  if (snapshot === undefined) {
    throw new StepFailedError(
      "The price changed since you approved it. Look again before running."
    );
  }
  const results = await listRunResults(ctx.sql, ctx.member.id, ctx.run.id);
  const generations = await getOwnedGenerations(
    ctx.sql,
    ctx.member.id,
    results.map((result) => result.generationId)
  );
  const byId = new Map(
    generations.map((generation) => [generation.id, generation])
  );
  const madeByNode = new Map<string, Generation[]>();
  for (const result of results) {
    const generation = byId.get(result.generationId);
    if (generation !== undefined) {
      madeByNode.set(result.nodeId, [
        ...(madeByNode.get(result.nodeId) ?? []),
        generation,
      ]);
    }
  }
  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      pickAssetId:
        resultPick(node, madeByNode.get(node.id) ?? []) ?? node.pickAssetId,
    })),
  };
};

/** The Models each Compare node in a run will ask, from the approved snapshot. */
export const compareModelsOf = (
  run: BoardRun
): Map<string, readonly string[]> => {
  const graph = run.steps[0]?.snapshot;
  if (graph === undefined) {
    return new Map();
  }
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const found = new Map<string, readonly string[]>();
  for (const step of run.steps) {
    const node = byId.get(step.nodeId);
    if (node?.kind === "compare") {
      found.set(node.id, node.settings.models);
    }
  }
  return found;
};
