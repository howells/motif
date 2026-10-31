/**
 * What a signed-in person can ask a phase 1 Task for, and how that becomes an
 * SDK `TaskInput`.
 *
 * Each Task's schema is strict: an option the App doesn't offer is refused
 * with its name, never dropped. Combinations the schema allows but a Model
 * can't honour are refused by the SDK's own planner, whose message is shown
 * as it stands. The browser names images only by the ids of assets it owns;
 * it never supplies a URL.
 */
import { CREATIVE_TAXONOMY, LOOKS, TIERS } from "@howells/motif-sdk";
import type { AspectRatio, TaskInput } from "@howells/motif-sdk";
import { z } from "zod";

import { MAX_IMAGES_PER_RUN, MAX_REFERENCES } from "../budget/policy";

export const PHASE_ONE_TASKS = [
  "generate",
  "vary",
  "erase",
  "reframe",
  "cutout",
  "upscale",
] as const;
export type PhaseOneTask = (typeof PHASE_ONE_TASKS)[number];

export const isPhaseOneTask = (value: string): value is PhaseOneTask =>
  (PHASE_ONE_TASKS as readonly string[]).includes(value);

/** Ratios offered for generate and reframe, in the order the boards draw them. */
export const APP_ASPECTS = [
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
] as const satisfies readonly AspectRatio[];

const LOOK_IDS: ReadonlySet<string> = new Set(LOOKS.map((look) => look.id));
const MOOD_IDS: ReadonlySet<string> = new Set(
  CREATIVE_TAXONOMY.mood.map((mood) => mood.id)
);

const assetId = z
  .string()
  .regex(/^ast_[0-9a-f]{32}$/u, "That isn't an image from your Library.");

const common = {
  /** A fresh id per press of Run; repeating it never runs or charges twice. */
  idempotencyKey: z.uuid(),
  /** A Model named by the person, overriding Motif's choice. */
  model: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{0,63}$/u)
    .optional(),
  tier: z.enum(TIERS).optional(),
};

const generate = z.strictObject({
  ...common,
  aspect: z.enum(APP_ASPECTS).optional(),
  count: z.int().min(1).max(MAX_IMAGES_PER_RUN).default(1),
  look: z
    .string()
    .refine((value) => LOOK_IDS.has(value), "Unknown Look.")
    .optional(),
  mood: z
    .string()
    .refine((value) => MOOD_IDS.has(value), "Unknown Mood.")
    .optional(),
  prompt: z.string().trim().min(1, "Write a prompt.").max(4000),
  referenceAssetIds: z.array(assetId).max(MAX_REFERENCES).default([]),
  task: z.literal("generate"),
});

const vary = z.strictObject({
  ...common,
  count: z.int().min(1).max(MAX_IMAGES_PER_RUN).default(1),
  prompt: z.string().trim().max(4000).optional(),
  sourceAssetId: assetId,
  task: z.literal("vary"),
});

const box = z.strictObject({
  height: z.int().min(1),
  width: z.int().min(1),
  x: z.int().min(0),
  y: z.int().min(0),
});

const erase = z.discriminatedUnion("mode", [
  z.strictObject({
    ...common,
    mode: z.literal("describe"),
    prompt: z.string().trim().min(1, "Say what to remove.").max(500),
    sourceAssetId: assetId,
    task: z.literal("erase"),
  }),
  z.strictObject({
    ...common,
    fill: z.string().trim().max(500).optional(),
    maskAssetId: assetId,
    mode: z.literal("paint"),
    sourceAssetId: assetId,
    task: z.literal("erase"),
  }),
  z.strictObject({
    ...common,
    boxes: z.array(box).min(1, "Draw at least one box.").max(20),
    mode: z.literal("boxes"),
    sourceAssetId: assetId,
    task: z.literal("erase"),
  }),
  z.strictObject({
    ...common,
    mode: z.literal("text"),
    sourceAssetId: assetId,
    task: z.literal("erase"),
  }),
]);

const reframe = z.discriminatedUnion("mode", [
  z.strictObject({
    ...common,
    aspect: z.enum(APP_ASPECTS),
    mode: z.literal("ratio"),
    sourceAssetId: assetId,
    task: z.literal("reframe"),
  }),
  z.strictObject({
    ...common,
    margin: z.strictObject({
      bottom: z.int().min(0).max(2048),
      left: z.int().min(0).max(2048),
      right: z.int().min(0).max(2048),
      top: z.int().min(0).max(2048),
    }),
    mode: z.literal("margin"),
    sourceAssetId: assetId,
    task: z.literal("reframe"),
  }),
]);

const cutout = z.strictObject({
  ...common,
  sourceAssetId: assetId,
  task: z.literal("cutout"),
});

const upscale = z.strictObject({
  ...common,
  detail: z.enum(["faithful", "generative", "creative"]).default("faithful"),
  scale: z.union([z.literal(2), z.literal(4)]),
  sourceAssetId: assetId,
  task: z.literal("upscale"),
  transparent: z.boolean().default(false),
});

export const TaskRequestSchema = z.union([
  generate,
  vary,
  erase,
  reframe,
  cutout,
  upscale,
]);
export type AppTaskRequest = z.infer<typeof TaskRequestSchema>;

/** Parse a request, naming the Task first so errors speak to the right form. */
export const parseTaskRequest = (
  body: unknown
): { ok: true; request: AppTaskRequest } | { ok: false; message: string } => {
  const task =
    typeof body === "object" && body !== null && "task" in body
      ? body.task
      : undefined;
  if (typeof task !== "string" || !isPhaseOneTask(task)) {
    return {
      message:
        typeof task === "string"
          ? `${task} isn't in the App yet. It runs in the terminal.`
          : "Name a Task.",
      ok: false,
    };
  }
  const parsed = TaskRequestSchema.safeParse(body);
  if (parsed.success) {
    return { ok: true, request: parsed.data };
  }
  const issue = parsed.error.issues[0];
  const where = issue?.path.join(".") ?? "";
  const unknown =
    issue?.code === "unrecognized_keys" ? ` (${issue.keys.join(", ")})` : "";
  return {
    message: `${issue?.message ?? "That request isn't valid."}${unknown}${where === "" ? "" : ` at ${where}`}`,
    ok: false,
  };
};

/** The asset ids a request names, by role. */
export const assetIdsOf = (
  request: AppTaskRequest
): { source?: string; mask?: string; references: readonly string[] } => {
  switch (request.task) {
    case "generate": {
      return { references: request.referenceAssetIds };
    }
    case "erase": {
      return request.mode === "paint"
        ? {
            mask: request.maskAssetId,
            references: [],
            source: request.sourceAssetId,
          }
        : { references: [], source: request.sourceAssetId };
    }
    case "cutout":
    case "reframe":
    case "upscale":
    case "vary": {
      return { references: [], source: request.sourceAssetId };
    }
    default: {
      throw new TypeError("Unknown Task.");
    }
  }
};

/** Images resolved for a request: data or placeholder URLs plus sizes. */
export interface ResolvedImages {
  readonly mask?: string;
  readonly references: readonly string[];
  readonly source?: {
    readonly url: string;
    readonly width: number;
    readonly height: number;
  };
}

/** The SDK input for a request. `model` pins the Model chosen when the run
 * was reserved, so the call that runs is the call that was priced. */
export const toTaskInput = (
  request: AppTaskRequest,
  images: ResolvedImages,
  model?: string
): TaskInput => {
  const base: TaskInput = {
    ...(model !== undefined && { model }),
    ...(request.tier !== undefined && { tier: request.tier }),
  };
  const source =
    images.source === undefined
      ? {}
      : {
          image: images.source.url,
          sourceSize: {
            height: images.source.height,
            width: images.source.width,
          },
        };
  switch (request.task) {
    case "generate": {
      return {
        ...base,
        count: request.count,
        prompt: request.prompt,
        ...(request.aspect !== undefined && { aspect: request.aspect }),
        ...(request.look !== undefined && { look: request.look }),
        ...(request.mood !== undefined && { mood: request.mood }),
        ...(images.references.length > 0 && { references: images.references }),
      };
    }
    case "vary": {
      return {
        ...base,
        ...source,
        count: request.count,
        ...(request.prompt !== undefined &&
          request.prompt !== "" && { prompt: request.prompt }),
      };
    }
    case "erase": {
      switch (request.mode) {
        case "describe": {
          return { ...base, ...source, prompt: request.prompt };
        }
        case "paint": {
          return request.fill !== undefined && request.fill !== ""
            ? {
                ...base,
                ...source,
                mask: images.mask,
                mode: "with",
                prompt: request.fill,
              }
            : { ...base, ...source, mask: images.mask };
        }
        case "boxes": {
          return { ...base, ...source, boxes: request.boxes, mode: "boxes" };
        }
        case "text": {
          return { ...base, ...source, mode: "text" };
        }
        default: {
          return base;
        }
      }
    }
    case "reframe": {
      return request.mode === "ratio"
        ? { ...base, ...source, aspect: request.aspect }
        : { ...base, ...source, margin: request.margin, mode: "margin" };
    }
    case "cutout": {
      return { ...base, ...source };
    }
    case "upscale": {
      return {
        ...base,
        ...source,
        scale: request.scale,
        ...(request.detail !== "faithful" && { mode: request.detail }),
        ...(request.transparent && { transparent: true }),
      };
    }
    default: {
      return base;
    }
  }
};

/** The prompt a Generation is listed under in the Library. */
export const promptOf = (request: AppTaskRequest): string | null => {
  switch (request.task) {
    case "generate": {
      return request.prompt;
    }
    case "vary": {
      return request.prompt ?? null;
    }
    case "erase": {
      if (request.mode === "describe") {
        return request.prompt;
      }
      return request.mode === "paint" ? (request.fill ?? null) : null;
    }
    case "cutout":
    case "reframe":
    case "upscale": {
      return null;
    }
    default: {
      throw new TypeError("Unknown Task.");
    }
  }
};
