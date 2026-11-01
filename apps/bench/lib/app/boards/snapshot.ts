/** Approved Board inputs, kept in the run's existing JSON steps. */
import { createHash } from "node:crypto";

import { z } from "zod";

import { SettingsInputSchema, isNodeKind, parseSettings } from "./model";
import type { Graph } from "./store";

const SnapshotNode = z
  .object({
    boardId: z.string(),
    id: z.string(),
    kind: z.string().refine(isNodeKind),
    pickAssetId: z.string().nullable(),
    settings: SettingsInputSchema,
    stale: z.boolean(),
    x: z.number(),
    y: z.number(),
  })
  .transform((node, ctx) => {
    if (!isNodeKind(node.kind)) {
      return z.NEVER;
    }
    const parsed = parseSettings(node.kind, node.settings);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.message });
      return z.NEVER;
    }
    return { ...node, ...parsed.node };
  });

export const GraphSnapshotSchema = z.object({
  nodes: z.array(SnapshotNode),
  wires: z.array(
    z.object({ from: z.string(), id: z.string(), to: z.string() })
  ),
});

/** Only this node and its input chain affect this result. Independent Makes
 * can add nodes to the same Inbox without invalidating each other's work. */
export const sameConfiguration = (
  approved: Graph,
  current: Graph,
  nodeId: string
): boolean => {
  const shape = (graph: Graph) => {
    const relevant = new Set([nodeId]);
    const visit = (id: string) => {
      for (const wire of graph.wires.filter(
        (candidate) => candidate.to === id
      )) {
        if (!relevant.has(wire.from)) {
          relevant.add(wire.from);
          visit(wire.from);
        }
      }
    };
    visit(nodeId);
    return {
      nodes: graph.nodes
        .flatMap((node) =>
          relevant.has(node.id)
            ? [
                {
                  id: node.id,
                  kind: node.kind,
                  pick: node.id === nodeId ? null : node.pickAssetId,
                  settings: node.settings,
                },
              ]
            : []
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
      wires: graph.wires
        .filter((wire) => relevant.has(wire.to))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  };
  return JSON.stringify(shape(approved)) === JSON.stringify(shape(current));
};

/** Bind the approval reply to the same settings, Picks and wires it priced. */
export const configurationKey = (graph: Graph): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        nodes: graph.nodes
          .map((node) => ({
            id: node.id,
            kind: node.kind,
            settings: node.settings,
            pickAssetId: node.pickAssetId,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        wires: graph.wires.toSorted((a, b) => a.id.localeCompare(b.id)),
      })
    )
    .digest("hex");
