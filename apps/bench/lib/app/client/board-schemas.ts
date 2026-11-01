/**
 * The shapes the Board routes send back, checked in the browser before the
 * canvas uses them. They mirror `lib/app/boards/views.ts` and the service's
 * quote and option types.
 */
import { z } from "zod";

import { NODE_KINDS, NODE_SETTINGS } from "@/lib/app/boards/model";

const Output = z.object({ assetId: z.string(), url: z.string() });

export const ResultViewSchema = z.object({
  completedAt: z.string().nullable(),
  costMicros: z.number().nullable(),
  createdAt: z.string(),
  elapsedMs: z.number().nullable(),
  error: z.string().nullable(),
  generationId: z.string(),
  model: z.string(),
  modelName: z.string(),
  outputs: z.array(Output),
  runId: z.string().nullable(),
  status: z.enum([
    "reserved",
    "submitting",
    "submitted",
    "completed",
    "failed",
    "unknown",
  ]),
  typicalMs: z.number().nullable(),
});
export type ResultViewData = z.infer<typeof ResultViewSchema>;

const nodeBase = {
  id: z.string(),
  names: z.record(z.string(), z.string()),
  pick: z
    .object({
      assetId: z.string(),
      height: z.number().nullable(),
      url: z.string(),
      width: z.number().nullable(),
    })
    .nullable(),
  price: z
    .discriminatedUnion("ok", [
      z.object({
        detail: z.string(),
        listMicros: z.number(),
        ok: z.literal(true),
      }),
      z.object({ ok: z.literal(false), reason: z.string() }),
    ])
    .nullable(),
  results: z.array(ResultViewSchema),
  stale: z.boolean(),
  x: z.number(),
  y: z.number(),
};

/** A node, its settings read with its own kind's schema: the browser
 * branches on `kind` and gets typed settings. */
export const NodeViewSchema = z.discriminatedUnion("kind", [
  z.object({
    ...nodeBase,
    kind: z.literal("prompt"),
    settings: NODE_SETTINGS.prompt,
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("source"),
    settings: NODE_SETTINGS.source,
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("generate"),
    settings: NODE_SETTINGS.generate,
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("vary"),
    settings: NODE_SETTINGS.vary,
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("erase"),
    settings: NODE_SETTINGS.erase,
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("reframe"),
    settings: NODE_SETTINGS.reframe,
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("cutout"),
    settings: NODE_SETTINGS.cutout,
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("upscale"),
    settings: NODE_SETTINGS.upscale,
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("compare"),
    settings: NODE_SETTINGS.compare,
  }),
]);
export type NodeViewData = z.infer<typeof NodeViewSchema>;

export const RunViewSchema = z.object({
  createdAt: z.string(),
  error: z.string().nullable(),
  fromNodeId: z.string(),
  id: z.string(),
  nodeIds: z.array(z.string()),
  scope: z.enum(["node", "downstream"]),
  status: z.enum(["running", "completed", "failed", "stopped"]),
});
export type RunViewData = z.infer<typeof RunViewSchema>;

export const BoardViewSchema = z.object({
  board: z.object({
    id: z.string(),
    kind: z.enum(["board", "inbox"]),
    name: z.string(),
  }),
  nodes: z.array(NodeViewSchema),
  runs: z.array(RunViewSchema),
  wires: z.array(
    z.object({ from: z.string(), id: z.string(), to: z.string() })
  ),
});
export type BoardViewData = z.infer<typeof BoardViewSchema>;

const StepQuoteSchema = z.discriminatedUnion("ok", [
  z.object({
    detail: z.string(),
    estimated: z.boolean(),
    kind: z.enum(NODE_KINDS),
    label: z.string(),
    listMicros: z.number(),
    micros: z.number(),
    models: z.array(z.string()),
    nodeId: z.string(),
    ok: z.literal(true),
  }),
  z.object({
    alternatives: z.array(
      z.object({ listMicros: z.number(), model: z.string(), name: z.string() })
    ),
    kind: z.enum(NODE_KINDS),
    label: z.string(),
    nodeId: z.string(),
    ok: z.literal(false),
    reason: z.string(),
  }),
]);
export type StepQuoteData = z.infer<typeof StepQuoteSchema>;

export const QuoteViewSchema = z.object({
  availableMicros: z.number(),
  capMicros: z.number(),
  levels: z.array(z.array(z.string())),
  listMicros: z.number(),
  micros: z.number(),
  month: z.string(),
  ready: z.boolean(),
  steps: z.array(StepQuoteSchema),
});
export type QuoteViewData = z.infer<typeof QuoteViewSchema>;

export const NodeOptionsSchema = z.object({
  models: z.array(
    z.object({
      chosen: z.boolean(),
      listMicros: z.number().nullable(),
      model: z.string(),
      name: z.string(),
      reason: z.string().nullable(),
      tier: z.string(),
    })
  ),
  motifChoice: z.string().nullable(),
});
export type NodeOptionsData = z.infer<typeof NodeOptionsSchema>;

export const RunReply = z.object({ run: RunViewSchema });

export const RunResultsReply = z.object({
  results: z.array(ResultViewSchema),
  run: RunViewSchema,
});

export type RunResultsData = z.infer<typeof RunResultsReply>;

export const BoardsReply = z.object({
  boards: z.array(
    z.object({
      id: z.string(),
      images: z.number(),
      kind: z.enum(["board", "inbox"]),
      name: z.string(),
    })
  ),
});

export const NewBoardReply = z.object({
  board: z.object({ id: z.string(), kind: z.string(), name: z.string() }),
});

export const MakeQuoteSchema = z.object({
  availableMicros: z.number(),
  capMicros: z.number(),
  listMicros: z.number(),
  micros: z.number(),
  model: z.string().nullable(),
  modelName: z.string().nullable(),
  reason: z.string().nullable(),
});
export type MakeQuoteData = z.infer<typeof MakeQuoteSchema>;
