/**
 * The capability tools: segment, ask, and enhance.
 *
 * Split from `create-server.ts`, which registers the original five inline and
 * already sits at its size ceiling. Each handler stays thin — validate the
 * arguments, read the endpoint and price out of `FAL_TOOLS`, call one
 * `FalClient` method, shape the reply. No fal normalisation lives here; the
 * SDK owns it.
 */

import { FAL_TOOLS } from "@howells/motif-sdk";
import type { FalClient, FalToolPrice, ToolResponse } from "@howells/motif-sdk";

import {
  enumSuggestion,
  invalidParams,
  parseImageUrl,
  parseOptionalEnum,
  toolError,
  toolReply,
} from "./tool-result.js";
import type { ToolReply } from "./tool-result.js";

// ─── Registry ids ────────────────────────────────────────────────────

const SEGMENT_TOOL_ID = "sam3-image";

const ASK_MODES = ["query", "caption", "detect", "point"] as const;
type AskMode = (typeof ASK_MODES)[number];

const ASK_TOOL_IDS = {
  caption: "moondream-caption",
  detect: "moondream-detect",
  point: "moondream-point",
  query: "moondream-query",
} as const satisfies Record<AskMode, keyof typeof FAL_TOOLS>;

const ENHANCE_MODES = [
  "upscale",
  "generative",
  "creative",
  "transparent",
  "restore",
  "denoise",
  "sharpen",
  "adjust",
] as const;
type EnhanceMode = (typeof ENHANCE_MODES)[number];

const ENHANCE_TOOL_IDS = {
  adjust: "topaz-adjust",
  creative: "topaz-creative",
  denoise: "topaz-denoise",
  generative: "topaz-generative",
  restore: "topaz-restore",
  sharpen: "topaz-sharpen",
  transparent: "topaz-transparent",
  upscale: "topaz-image",
} as const satisfies Record<EnhanceMode, keyof typeof FAL_TOOLS>;

const MAX_MASKS = 50;

// ─── Cost ────────────────────────────────────────────────────────────

/**
 * Machine-readable cost for one tool run, read from the registry.
 *
 * Only `call` pricing is knowable before the request. Per-megapixel and
 * per-second endpoints are billed on an output size or a duration nobody knows
 * yet, and `metered` endpoints on tokens or frames, so those report the unit
 * rate — where there is one — and leave `cost_estimate` null. A zero here
 * would read as free, which is a different claim from "unknown".
 */
function toolCost(price: FalToolPrice, pricing: string) {
  if (price.kind === "call") {
    return { cost_estimate: price.usd, pricing };
  }
  if (price.kind === "megapixel") {
    return {
      cost_estimate: null,
      cost_per_megapixel: price.usd,
      pricing,
    };
  }
  if (price.kind === "second") {
    return { cost_estimate: null, cost_per_second: price.usd, pricing };
  }
  return { cost_estimate: null, pricing };
}

/** Registry cost fields for a tool id. */
function costOf(toolId: keyof typeof FAL_TOOLS) {
  const tool = FAL_TOOLS[toolId];
  return toolCost(tool.price, tool.pricing);
}

// ─── Routing ─────────────────────────────────────────────────────────

/**
 * Run a registry tool down whichever path its own entry declares.
 *
 * `queued: true` marks endpoints that routinely outrun the 120-second sync
 * timeout. Calling one of those synchronously does not merely fail slowly:
 * `FalClient` treats the abort from its own timer as a retriable network
 * error, so a single call can POST — and be billed for — the same paid
 * endpoint several times before it gives up. Every Topaz entry behind
 * `enhance` carries the flag today, but the registry is where that is
 * recorded, so read it rather than restate it here.
 */
async function runRegistryTool(
  motif: FalClient,
  toolId: keyof typeof FAL_TOOLS,
  input: string,
  options?: Record<string, unknown>
) {
  // `endpoint` is here only so a whole registry entry is what gets checked:
  // a type of the lone optional flag is a weak type nothing has to satisfy.
  const tool: { readonly endpoint: string; readonly queued?: true } =
    FAL_TOOLS[toolId];
  const runOptions = {
    input,
    tool: toolId,
    ...(options === undefined ? {} : { options }),
  };
  if (tool.queued === true) {
    return await motif.runToolQueued(runOptions);
  }
  return await motif.runTool(runOptions);
}

// ─── Result shaping ──────────────────────────────────────────────────

/** True when a value is a plain (non-array, non-null) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * URLs carried by a fal output value.
 *
 * fal returns file outputs as a bare URL string, as `{ url }`, or as an array
 * of either, depending on the endpoint. All three shapes appear across the
 * SAM and Topaz families.
 */
function collectUrls(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectUrls(item));
  }
  if (isRecord(value) && typeof value.url === "string") {
    return [value.url];
  }
  return [];
}

/** Image objects with their dimensions where fal reported them. */
function imageOutputs(value: unknown) {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => {
    if (!isRecord(item) || typeof item.url !== "string") {
      return collectUrls(item).map((url) => ({ url }));
    }
    return [
      {
        url: item.url,
        ...(typeof item.width === "number" && { width: item.width }),
        ...(typeof item.height === "number" && { height: item.height }),
      },
    ];
  });
}

/** Copy `key` from a fal result only when it carries a value. */
function passthrough(result: ToolResponse, key: string) {
  const value = result[key];
  return value === undefined || value === null ? {} : { [key]: value };
}

// ─── Shared schema fragments ─────────────────────────────────────────

const COST_SCHEMA = {
  cost_estimate: {
    description:
      "Estimated cost in USD, or null when the endpoint is billed per megapixel, per second, or metered.",
    type: ["number", "null"],
  },
  cost_per_megapixel: {
    description: "Per-output-megapixel rate in USD, where that is the basis",
    type: "number",
  },
  cost_per_second: {
    description: "Per-second rate in USD, where that is the basis",
    type: "number",
  },
  pricing: {
    description: "Registry pricing note for the endpoint",
    type: "string",
  },
};

const IMAGE_URL_SCHEMA = {
  description: "URL of the image to process",
  type: "string",
};

// ─── Tool definitions ────────────────────────────────────────────────

export const CAPABILITY_TOOLS = [
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
      title: "Segment Image",
    },
    description:
      "Segment a named subject out of an image with SAM 3 and return its mask URLs, boxes, and scores. Use when the user wants a cutout, a selection, or the location of a specific thing they can name. Do not use to remove a background wholesale; use remove_background instead. This calls fal.ai.",
    inputSchema: {
      properties: {
        imageUrl: IMAGE_URL_SCHEMA,
        maxMasks: {
          description: `Maximum number of masks to return (1-${MAX_MASKS}, endpoint default 3)`,
          maximum: MAX_MASKS,
          minimum: 1,
          type: "number",
        },
        prompt: {
          description: "The subject to segment, for example 'the red chair'",
          type: "string",
        },
      },
      required: ["imageUrl", "prompt"],
      type: "object" as const,
    },
    name: "segment",
    outputSchema: {
      properties: {
        ...COST_SCHEMA,
        boxes: {
          description: "Bounding boxes for the matched instances",
          type: "array",
        },
        image: {
          description: "Preview image with the mask applied, where returned",
          type: "string",
        },
        masks: {
          description: "URLs of the returned mask images",
          items: { format: "uri", type: "string" },
          type: "array",
        },
        scores: {
          description: "Confidence score per matched instance",
          type: "array",
        },
      },
      required: ["masks"],
      type: "object",
    },
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
      title: "Ask About Image",
    },
    description:
      "Ask Moondream 3 about an image and get text back: a free-form answer, a caption, detected object boxes, or points. Use when the user wants to know what is in an image rather than to change it. This produces no file. This calls fal.ai.",
    inputSchema: {
      properties: {
        imageUrl: IMAGE_URL_SCHEMA,
        mode: {
          description:
            "query=answer a question, caption=describe the image, detect=bounding boxes for a named subject, point=coordinates for a named subject. Default: query",
          enum: [...ASK_MODES],
          type: "string",
        },
        question: {
          description:
            "The question to answer, or the subject to detect or point at. Required for every mode except caption.",
          type: "string",
        },
      },
      required: ["imageUrl"],
      type: "object" as const,
    },
    name: "ask",
    outputSchema: {
      properties: {
        ...COST_SCHEMA,
        answer: {
          description: "The model's text answer or caption",
          type: "string",
        },
        mode: { description: "Mode the answer came from", type: "string" },
        objects: {
          description: "Detected objects with bounding boxes (detect mode)",
          type: "array",
        },
        points: {
          description: "Point coordinates per instance (point mode)",
          type: "array",
        },
        reasoning: {
          description: "Model reasoning, where the endpoint returns it",
          type: "string",
        },
      },
      required: ["mode"],
      type: "object",
    },
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
      title: "Enhance Image",
    },
    description:
      "Restore, denoise, sharpen, adjust, or upscale an image with Topaz. Use for professional-grade enhancement of a remote image URL. Every mode runs through the fal queue and can take minutes. Cost is per output megapixel, so it is not known before the call. This calls fal.ai.",
    inputSchema: {
      properties: {
        imageUrl: IMAGE_URL_SCHEMA,
        mode: {
          description:
            "upscale=Standard V2 enlargement, generative=synthesises detail, creative=reimagines detail, transparent=preserves alpha, restore=damaged photographs, denoise/sharpen/adjust=source-resolution corrections. Default: upscale",
          enum: [...ENHANCE_MODES],
          type: "string",
        },
      },
      required: ["imageUrl"],
      type: "object" as const,
    },
    name: "enhance",
    outputSchema: {
      properties: {
        ...COST_SCHEMA,
        images: {
          description: "Enhanced image(s)",
          items: {
            properties: {
              height: { type: "number" },
              url: { format: "uri", type: "string" },
              width: { type: "number" },
            },
            required: ["url"],
            type: "object",
          },
          type: "array",
        },
        mode: { description: "Mode the run used", type: "string" },
      },
      required: ["images"],
      type: "object",
    },
  },
];

// ─── Handlers ────────────────────────────────────────────────────────

/** Narrow an optional integer argument within an inclusive range. */
function parseOptionalInteger(
  value: unknown,
  field: string,
  min: number,
  max: number
): { error: ToolReply; ok: false } | { ok: true; value?: number } {
  if (value === undefined) {
    return { ok: true };
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    return {
      error: invalidParams(
        `Invalid ${field}: ${JSON.stringify(value)}. Must be an integer between ${min} and ${max}.`,
        [`Choose ${field} in the range ${min}-${max}.`]
      ),
      ok: false,
    };
  }
  return { ok: true, value };
}

async function handleSegment(
  motif: FalClient,
  args: Record<string, unknown>
): Promise<ToolReply> {
  const imageUrl = parseImageUrl(args.imageUrl, "segment");
  if (!imageUrl.ok) {
    return imageUrl.error;
  }
  const prompt = args.prompt;
  if (typeof prompt !== "string" || prompt.trim() === "") {
    return invalidParams("segment requires a non-empty string prompt.", [
      "Pass the subject to segment, for example 'the red chair'.",
    ]);
  }
  const maxMasks = parseOptionalInteger(
    args.maxMasks,
    "maxMasks",
    1,
    MAX_MASKS
  );
  if (!maxMasks.ok) {
    return maxMasks.error;
  }

  const result = await runRegistryTool(motif, SEGMENT_TOOL_ID, imageUrl.value, {
    prompt,
    ...(maxMasks.value === undefined ? {} : { max_masks: maxMasks.value }),
  });

  if (result.isErr()) {
    return toolError("SEGMENT_FAILED", result.error.message, {
      isRetriable: true,
      suggestions: [
        "Check the input image URL and retry.",
        "Name the subject more plainly if nothing matched.",
      ],
      traceId: result.error.requestId,
    });
  }

  return toolReply({
    ...costOf(SEGMENT_TOOL_ID),
    ...passthrough(result.value, "boxes"),
    ...passthrough(result.value, "scores"),
    masks: collectUrls(result.value.masks),
    ...(collectUrls(result.value.image)[0] === undefined
      ? {}
      : { image: collectUrls(result.value.image)[0] }),
  });
}

async function handleAsk(
  motif: FalClient,
  args: Record<string, unknown>
): Promise<ToolReply> {
  const imageUrl = parseImageUrl(args.imageUrl, "ask");
  if (!imageUrl.ok) {
    return imageUrl.error;
  }
  const modeParse = parseOptionalEnum(args.mode, ASK_MODES, "mode");
  if (!modeParse.ok) {
    return invalidParams(modeParse.error, [enumSuggestion("mode", ASK_MODES)]);
  }
  const mode = modeParse.value ?? "query";

  const question = args.question;
  const hasQuestion = typeof question === "string" && question.trim() !== "";
  if (question !== undefined && typeof question !== "string") {
    return invalidParams(
      `Invalid question: ${JSON.stringify(question)}. Must be a string.`,
      ["Pass the question as a string."]
    );
  }
  if (mode !== "caption" && !hasQuestion) {
    return invalidParams(`ask in ${mode} mode requires a question.`, [
      mode === "query"
        ? "Pass a question about the image."
        : `Pass the subject to ${mode} in question.`,
      "Use mode 'caption' to describe the image without a question.",
    ]);
  }

  const toolId = ASK_TOOL_IDS[mode];
  const result = await runRegistryTool(
    motif,
    toolId,
    imageUrl.value,
    hasQuestion ? { prompt: question } : {}
  );

  if (result.isErr()) {
    return toolError("ASK_FAILED", result.error.message, {
      isRetriable: true,
      suggestions: ["Check the input image URL and retry."],
      traceId: result.error.requestId,
    });
  }

  const output = result.value.output;
  return toolReply({
    ...costOf(toolId),
    ...(typeof output === "string" ? { answer: output } : {}),
    ...passthrough(result.value, "objects"),
    ...passthrough(result.value, "points"),
    ...passthrough(result.value, "reasoning"),
    mode,
  });
}

async function handleEnhance(
  motif: FalClient,
  args: Record<string, unknown>
): Promise<ToolReply> {
  const imageUrl = parseImageUrl(args.imageUrl, "enhance");
  if (!imageUrl.ok) {
    return imageUrl.error;
  }
  const modeParse = parseOptionalEnum(args.mode, ENHANCE_MODES, "mode");
  if (!modeParse.ok) {
    return invalidParams(modeParse.error, [
      enumSuggestion("mode", ENHANCE_MODES),
    ]);
  }
  const mode = modeParse.value ?? "upscale";
  const toolId = ENHANCE_TOOL_IDS[mode];

  const result = await runRegistryTool(motif, toolId, imageUrl.value);

  if (result.isErr()) {
    return toolError("ENHANCE_FAILED", result.error.message, {
      isRetriable: true,
      suggestions: [
        "Check the input image URL and retry.",
        "Very large inputs can exceed the queue's polling window.",
      ],
      traceId: result.error.requestId,
    });
  }

  return toolReply({
    ...costOf(toolId),
    images: imageOutputs(result.value.image),
    mode,
  });
}

/**
 * Dispatch a capability tool call, or return `undefined` when `name` belongs
 * to one of the tools `create-server.ts` handles itself.
 */
export async function handleCapabilityTool(
  motif: FalClient,
  name: string,
  args: Record<string, unknown>
): Promise<ToolReply | undefined> {
  if (name === "segment") {
    return await handleSegment(motif, args);
  }
  if (name === "ask") {
    return await handleAsk(motif, args);
  }
  if (name === "enhance") {
    return await handleEnhance(motif, args);
  }
  return undefined;
}
