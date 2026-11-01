/**
 * The shapes the App's API sends back, checked in the browser before a screen
 * uses them. They mirror `lib/app/views.ts` and the route handlers; a reply
 * that doesn't match becomes an `ApiError`, never a half-drawn screen.
 */
import { z } from "zod";

const Output = z.object({ assetId: z.string(), url: z.string() });

export const GenerationViewSchema = z.object({
  boundMicros: z.number(),
  comparisonId: z.string().nullable(),
  completedAt: z.string().nullable(),
  costBasis: z.string().nullable(),
  costMicros: z.number().nullable(),
  costStatus: z.enum(["held", "settled", "retained", "released"]),
  createdAt: z.string(),
  elapsedMs: z.number().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  id: z.string(),
  input: z.record(z.string(), z.unknown()),
  mode: z.string().nullable(),
  model: z.string(),
  outputs: z.array(Output),
  parentId: z.string().nullable(),
  prompt: z.string().nullable(),
  requestRef: z.string().nullable(),
  retryOf: z.string().nullable(),
  sourceAssetId: z.string().nullable(),
  stackId: z.string(),
  status: z.enum([
    "reserved",
    "submitting",
    "submitted",
    "completed",
    "failed",
    "unknown",
  ]),
  submittedAt: z.string().nullable(),
  task: z.string(),
  tier: z.string(),
});

export const StackViewSchema = z.object({
  board: z.object({ id: z.string(), name: z.string() }).nullable(),
  comparisonId: z.string().nullable(),
  completedAt: z.string(),
  costMicros: z.number(),
  cover: Output.nullable(),
  latestId: z.string(),
  model: z.string(),
  picked: z.boolean(),
  prompt: z.string().nullable(),
  stackId: z.string(),
  task: z.string(),
  versions: z.number(),
});

export const GenerationReply = z.object({ generation: GenerationViewSchema });
export const GenerationsReply = z.object({
  generations: z.array(GenerationViewSchema),
});
export const StacksReply = z.object({
  images: z.number(),
  stacks: z.array(StackViewSchema),
});
export const StartedReply = z.object({ generationId: z.string() });
export const ComparisonStartedReply = z.object({
  comparisonId: z.string().nullable(),
});

export const ComparisonReply = z.object({
  comparison: z.object({
    generations: z.array(GenerationViewSchema),
    id: z.string(),
    models: z.array(z.string()),
    prompt: z.string(),
  }),
});

const quoted = {
  availableMicros: z.number(),
  chosenBy: z.enum(["look", "model", "pin", "ranking"]),
  model: z.string(),
  tier: z.string(),
};

export const QuoteSchema = z.discriminatedUnion("kind", [
  z.object({
    ...quoted,
    boundMicros: z.number(),
    estimate: z.object({
      basis: z.enum(["measured", "projected", "unknown"]),
      usd: z.number().nullable(),
    }),
    kind: z.literal("ready"),
  }),
  z.object({
    ...quoted,
    alternatives: z.array(
      z.object({ micros: z.number(), model: z.string(), tier: z.string() })
    ),
    kind: z.literal("blocked"),
    reason: z.string(),
  }),
]);

export const BudgetReply = z.object({
  budget: z.object({
    capMicros: z.number(),
    heldMicros: z.number(),
    members: z.array(
      z.object({
        heldMicros: z.number(),
        memberId: z.string(),
        retained: z.number(),
        runs: z.number(),
        spentMicros: z.number(),
      })
    ),
    month: z.string(),
    spentMicros: z.number(),
  }),
});

export const PeopleSchema = z.object({
  invitations: z.array(
    z.object({ createdAt: z.string(), email: z.string(), id: z.string() })
  ),
  people: z.array(
    z.object({
      createdAt: z.string(),
      email: z.string(),
      id: z.string(),
      name: z.string().nullable(),
      role: z.enum(["member", "owner"]),
      status: z.enum(["active", "revoked"]),
    })
  ),
});

export const UploadReply = z.object({
  asset: z.object({
    height: z.number(),
    id: z.string(),
    url: z.string(),
    width: z.number(),
  }),
});

/** A reply whose body the page doesn't read. */
export const Ignored = z.unknown();

const MadeFromStepSchema = z.object({
  assetId: z.string(),
  generationId: z.string(),
  task: z.string(),
  url: z.string(),
});

export const LibraryItemReply = z.object({
  item: z.object({
    assetId: z.string(),
    board: z.object({ id: z.string(), name: z.string() }).nullable(),
    completedAt: z.string().nullable(),
    costMicros: z.number().nullable(),
    generationId: z.string(),
    height: z.number().nullable(),
    madeFrom: z.array(MadeFromStepSchema),
    mode: z.string().nullable(),
    modelName: z.string(),
    nodeId: z.string().nullable(),
    prompt: z.string().nullable(),
    task: z.string(),
    url: z.string(),
    width: z.number().nullable(),
  }),
});

export type LibraryItemData = z.infer<typeof LibraryItemReply>["item"];
