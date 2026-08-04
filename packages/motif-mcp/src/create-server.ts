/**
 * createMotifMcpServer
 *
 * Factory function — creates and configures the Motif MCP server without
 * binding to a transport. Extracted for testability (InMemoryTransport tests).
 */

/* oxlint-disable max-lines -- File is a data-heavy tool/resource
 * registry (TOOLS, RESOURCES, HISTORY_SCHEMA are large literal JSON-schema
 * objects) plus one request-handler factory. Splitting it is a structural
 * refactor, not a lint fix, and out of this toolchain migration's scope
 * (no behaviour/architecture changes). Revisit as a dedicated refactor.
 */

import type {
  AspectRatio,
  CreativeDirection,
  ImageOutputFormat,
  MotifServer,
  Resolution,
} from "@howells/motif-sdk";
import {
  ASPECT_RATIOS,
  CREATIVE_FIELDS,
  CREATIVE_TAXONOMY,
  FAL_TOOLS,
  GENERATION_MODELS,
  IMAGE_EDITING_TOP_20,
  IMAGE_TEXT_TO_IMAGE_TOP_20,
  MODELS,
  RESOLUTIONS,
  VIDEO_IMAGE_TO_VIDEO_TOP_15,
  VIDEO_TEXT_TO_VIDEO_TOP_15,
} from "@howells/motif-sdk";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { readHistory } from "./history.js";

// ─── Preset → aspect resolution ─────────────────────────────────────

const PRESET_MAP: Record<string, AspectRatio> = {
  cover: "2:3",
  feed: "4:5",
  landscape: "16:9",
  og: "16:9",
  portrait: "2:3",
  reel: "9:16",
  square: "1:1",
  story: "9:16",
  ultra: "21:9",
  wallpaper: "9:16",
  wide: "21:9",
};

// ─── Shared outputSchema shapes ──────────────────────────────────────

const IMAGE_ITEM_SCHEMA = {
  properties: {
    height: { description: "Image height in pixels", type: "number" },
    url: {
      description: "Direct URL to the generated image",
      format: "uri",
      type: "string",
    },
    width: { description: "Image width in pixels", type: "number" },
  },
  required: ["url"],
  type: "object",
};

const IMAGES_ARRAY_SCHEMA = {
  description: "Generated images",
  items: IMAGE_ITEM_SCHEMA,
  type: "array",
};

const HISTORY_SCHEMA = {
  properties: {
    costs: {
      properties: {
        allTime: { type: "number" },
        session: { type: "number" },
        today: { type: "number" },
      },
      required: ["allTime", "session", "today"],
      type: "object",
    },
    generations: {
      items: {
        properties: {
          aspect: { type: "string" },
          cost: { type: "number" },
          editedFrom: { type: "string" },
          filePath: { type: "string" },
          id: { type: "string" },
          model: { type: "string" },
          prompt: { type: "string" },
          resolution: { type: "string" },
          timestamp: { type: "string" },
        },
        required: [
          "aspect",
          "cost",
          "filePath",
          "id",
          "model",
          "prompt",
          "resolution",
          "timestamp",
        ],
        type: "object",
      },
      type: "array",
    },
    hasMore: { type: "boolean" },
    limit: { type: "number" },
    offset: { type: "number" },
    total: { type: "number" },
  },
  required: ["costs", "generations", "hasMore", "limit", "offset", "total"],
  type: "object",
};

const RESOURCES = [
  {
    description:
      "Read-only registry of Motif model aliases, fal endpoints, pricing, and capabilities.",
    mimeType: "application/json",
    name: "models",
    title: "Motif Model Registry",
    uri: "motif://models",
  },
  {
    description:
      "Read-only registry of normalized fal utility tools exposed by the SDK.",
    mimeType: "application/json",
    name: "tools",
    title: "Motif Fal Utility Tool Registry",
    uri: "motif://tools",
  },
  {
    description:
      "Read-only Artificial Analysis leaderboard snapshots bundled with Motif metadata.",
    mimeType: "application/json",
    name: "leaderboards",
    title: "Motif Leaderboard Snapshots",
    uri: "motif://leaderboards",
  },
  {
    description:
      "JSON schema for local generation history. This resource does not expose user history values.",
    mimeType: "application/json",
    name: "history_schema",
    title: "Motif Local History Schema",
    uri: "motif://history/schema",
  },
];

const resourcePayload = (uri: string): unknown => {
  switch (uri) {
    case "motif://models": {
      return MODELS;
    }
    case "motif://tools": {
      return FAL_TOOLS;
    }
    case "motif://leaderboards": {
      return {
        image_editing_top_20: IMAGE_EDITING_TOP_20,
        image_text_to_image_top_20: IMAGE_TEXT_TO_IMAGE_TOP_20,
        video_image_to_video_top_15: VIDEO_IMAGE_TO_VIDEO_TOP_15,
        video_text_to_video_top_15: VIDEO_TEXT_TO_VIDEO_TOP_15,
      };
    }
    case "motif://history/schema": {
      return HISTORY_SCHEMA;
    }
    default: {
      return null;
    }
  }
};

const toolError = (
  code: string,
  message: string,
  options: {
    isRetriable?: boolean;
    suggestions?: string[];
  } = {}
) => {
  const structured = {
    code,
    error: true,
    is_retriable: options.isRetriable ?? false,
    message,
    suggestions: options.suggestions ?? [],
  };

  return {
    content: [{ text: JSON.stringify(structured), type: "text" as const }],
    isError: true,
    structuredContent: structured,
  };
};

const imageContent = (image: {
  height?: null | number;
  url: string;
  width?: null | number;
}) => ({
  url: image.url,
  ...(typeof image.width === "number" && { width: image.width }),
  ...(typeof image.height === "number" && { height: image.height }),
});

/**
 * Build the reusable creative direction input schema for MCP tools.
 *
 * The schema mirrors the SDK taxonomy so agents can discover valid option ids
 * before spending credits on `generate` or `vary`.
 */
const creativeInputSchema = () => ({
  additionalProperties: false,
  description:
    "Optional creative direction choices that enrich the prompt before generation.",
  properties: Object.fromEntries(
    CREATIVE_FIELDS.map((field) => [
      field,
      {
        description: `Creative ${field} direction`,
        enum: CREATIVE_TAXONOMY[field].map((option) => option.id),
        type: "string",
      },
    ])
  ),
  type: "object",
});

// ─── Tool definitions ────────────────────────────────────────────────

const TOOLS = [
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
      title: "Generate Images",
    },
    description:
      "Generate images from a prompt using Motif's normalized fal model registry. Use when the user explicitly asks to create new image media and has accepted fal credit spend. Do not use for inspecting available models or past generations; read motif://models or call history instead. This calls fal.ai and returns remote image URLs.",
    inputSchema: {
      properties: {
        aspect: {
          description: "Aspect ratio for the output image",
          enum: ASPECT_RATIOS,
          type: "string",
        },
        creative: creativeInputSchema(),
        enableGoogleSearch: {
          description: "Enable fal enable_google_search where supported",
          type: "boolean",
        },
        enableWebSearch: {
          description: "Enable web search context where supported",
          type: "boolean",
        },
        model: {
          description:
            "Motif generation model alias. Read motif://models for current pricing, endpoints, and capabilities. Default: gpt",
          enum: GENERATION_MODELS,
          type: "string",
        },
        numImages: {
          description: "Number of images to generate (1-4, default 1)",
          maximum: 4,
          minimum: 1,
          type: "number",
        },
        outputFormat: {
          description: "Output image format where supported",
          enum: ["jpeg", "png", "webp"],
          type: "string",
        },
        preset: {
          description:
            "Named preset that sets aspect ratio. cover=2:3 (book), square=1:1, landscape=16:9, portrait=2:3, story/reel/wallpaper=9:16, feed=4:5, og=16:9, wide/ultra=21:9",
          enum: [
            "cover",
            "square",
            "landscape",
            "portrait",
            "story",
            "reel",
            "feed",
            "og",
            "wallpaper",
            "wide",
            "ultra",
          ],
          type: "string",
        },
        prompt: {
          description: "Description of the image to generate",
          type: "string",
        },
        resolution: {
          description: "Output resolution where supported",
          enum: RESOLUTIONS,
          type: "string",
        },
        seed: {
          description: "Reproducible generation seed where supported",
          type: "number",
        },
        transparent: {
          description:
            "Generate with transparent background (PNG output, GPT models only)",
          type: "boolean",
        },
      },
      required: ["prompt"],
      type: "object" as const,
    },
    name: "generate",
    outputSchema: {
      properties: {
        cost_estimate: { description: "Estimated cost in USD", type: "number" },
        images: IMAGES_ARRAY_SCHEMA,
        seed: {
          description: "Seed used for generation (where supported)",
          type: "number",
        },
      },
      required: ["images"],
      type: "object",
    },
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
      title: "Upscale Image",
    },
    description:
      "Upscale an existing image URL to higher resolution. Use when the user already has a remote image URL and wants enhancement or enlargement. Do not use for local file paths unless another tool has uploaded them first. This calls fal.ai and returns remote image URLs.",
    inputSchema: {
      properties: {
        imageUrl: {
          description: "URL of the image to upscale",
          type: "string",
        },
        model: {
          description:
            "Upscale model to use. clarity=faster ($0.02), crystal=AI-enhanced detail ($0.02). Default: clarity",
          enum: ["clarity", "crystal"],
          type: "string",
        },
      },
      required: ["imageUrl"],
      type: "object" as const,
    },
    name: "upscale",
    outputSchema: {
      properties: {
        images: {
          description: "Upscaled image(s)",
          items: IMAGE_ITEM_SCHEMA,
          type: "array",
        },
      },
      required: ["images"],
      type: "object",
    },
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
      title: "Remove Background",
    },
    description:
      "Remove the background from an existing image URL and return a transparent PNG. Use for product cutouts, masks, and compositing inputs. Do not use for prompt-based generation or local file paths unless another tool has uploaded them first. This calls fal.ai.",
    inputSchema: {
      properties: {
        imageUrl: {
          description: "URL of the image to process",
          type: "string",
        },
        model: {
          description:
            "Background removal model. rmbg=BiRefNet ($0.02), bria=Bria RMBG 2.0 ($0.02). Default: rmbg",
          enum: ["rmbg", "bria"],
          type: "string",
        },
      },
      required: ["imageUrl"],
      type: "object" as const,
    },
    name: "remove_background",
    outputSchema: {
      properties: {
        images: {
          description: "Processed image(s) with background removed",
          items: {
            properties: {
              url: {
                description: "URL to the PNG with transparent background",
                format: "uri",
                type: "string",
              },
            },
            required: ["url"],
            type: "object",
          },
          type: "array",
        },
      },
      required: ["images"],
      type: "object",
    },
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
      title: "Generate Variation",
    },
    description:
      "Generate prompt-guided variations or edits from one or more reference image URLs. Use when the user wants an existing image transformed while preserving some visual context. Do not use for pure text-to-image generation; use generate instead. This calls fal.ai and returns remote image URLs.",
    inputSchema: {
      properties: {
        creative: creativeInputSchema(),
        imageUrls: {
          description: "Reference image URLs to use as a base (at least one)",
          items: { type: "string" },
          minItems: 1,
          type: "array",
        },
        inputFidelity: {
          description:
            "How closely to follow the reference image. low=loose inspiration, high=faithful reproduction",
          enum: ["low", "high"],
          type: "string",
        },
        model: {
          description:
            "Model to use for variation. Must support image editing. Read motif://models for current reference limits and capabilities. Default: gpt",
          enum: [
            "gpt2",
            "gpt",
            "banana2",
            "banana",
            "gemini",
            "gemini3",
            "seedream4",
            "seedream45",
            "flux2-max",
            "flux2-pro",
            "flux2-flex",
            "flux2-dev",
            "flux",
            "grok-image",
          ],
          type: "string",
        },
        prompt: {
          description:
            "Prompt describing the desired changes or new image based on the reference(s)",
          type: "string",
        },
      },
      required: ["prompt", "imageUrls"],
      type: "object" as const,
    },
    name: "vary",
    outputSchema: {
      properties: {
        cost_estimate: { description: "Estimated cost in USD", type: "number" },
        images: IMAGES_ARRAY_SCHEMA,
      },
      required: ["images"],
      type: "object",
    },
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
      title: "Generation History",
    },
    description:
      "List recent image generations from the local CLI history (~/.motif/history.json). Use only when the user wants local Motif history, costs, prompts, or file paths exposed to this MCP client. Do not call for model metadata; read motif://models instead.",
    inputSchema: {
      properties: {
        limit: {
          description:
            "Maximum number of generations to return (1-50, default 10)",
          maximum: 50,
          minimum: 1,
          type: "number",
        },
        offset: {
          description:
            "Number of generations to skip for pagination (default 0)",
          minimum: 0,
          type: "number",
        },
      },
      required: [],
      type: "object" as const,
    },
    name: "history",
    outputSchema: {
      properties: {
        costs: {
          properties: {
            allTime: {
              description: "Total spend across all time (USD)",
              type: "number",
            },
            session: {
              description: "Spend in the current session (USD)",
              type: "number",
            },
            today: { description: "Spend today (USD)", type: "number" },
          },
          required: ["allTime", "session", "today"],
          type: "object",
        },
        generations: {
          description: "Generations, newest first",
          items: {
            properties: {
              aspect: { description: "Aspect ratio used", type: "string" },
              cost: {
                description: "Cost of this generation (USD)",
                type: "number",
              },
              editedFrom: {
                description:
                  "ID of the source generation if this was a variation",
                type: "string",
              },
              filePath: {
                description: "Local file path where the image was saved",
                type: "string",
              },
              id: { description: "Unique generation ID", type: "string" },
              model: { description: "Model alias used", type: "string" },
              prompt: {
                description: "Prompt used to generate the image",
                type: "string",
              },
              resolution: {
                description: "Resolution setting used",
                type: "string",
              },
              timestamp: {
                description: "ISO 8601 timestamp of the generation",
                type: "string",
              },
            },
            required: [
              "aspect",
              "cost",
              "filePath",
              "id",
              "model",
              "prompt",
              "resolution",
              "timestamp",
            ],
            type: "object",
          },
          type: "array",
        },
        hasMore: {
          description: "Whether more generations exist beyond this page",
          type: "boolean",
        },
        limit: { description: "Limit applied to this page", type: "number" },
        offset: { description: "Offset applied to this page", type: "number" },
        total: {
          description: "Total number of generations in history",
          type: "number",
        },
      },
      required: ["costs", "generations", "hasMore", "limit", "offset", "total"],
      type: "object",
    },
  },
];

// ─── Server factory ──────────────────────────────────────────────────

/**
 * Narrow MCP `CallToolRequest` arguments to the shape a tool handler expects.
 *
 * The MCP protocol advertises each tool's expected shape via `inputSchema`
 * (see TOOLS above), but this SDK version does not itself validate `args`
 * against that schema before invoking the handler — there is no runtime
 * check to narrow against. Isolating the cast in one small, named helper
 * (instead of repeating `args as {...}` in every branch below) keeps the
 * unsafe boundary in one documented place rather than five.
 *
 * `T` deliberately appears only in the return position: it can never be
 * inferred from `args` (that's the whole point — there's nothing to infer
 * from), so every call site names it explicitly, e.g. `parseArgs<{...}>(args)`.
 */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-parameters -- see doc comment above
const parseArgs = <T>(args: Record<string, unknown>): T => args as T;

/**
 * Create a Motif MCP server without binding it to a transport.
 *
 * The caller owns the `MotifServer` instance and chooses stdio, in-memory, or
 * another MCP transport; this factory only registers Motif resources and tools.
 */
// Low-level `Server` is intentional here (manual setRequestHandler wiring for
// tools/resources); migrating to the high-level `McpServer` API is a real
// behaviour/shape change to this factory's request-handling, out of this
// lint-only migration. The line-count warning follows from registering four
// request handlers in one factory (a structural split is the same
// out-of-scope refactor as the file-level max-lines above).
// oxlint-disable-next-line typescript/no-deprecated, max-lines-per-function -- see comment above
export const createMotifMcpServer = (motif: MotifServer): Server => {
  // oxlint-disable-next-line typescript/no-deprecated -- see factory doc comment above
  const server = new Server(
    { name: "motif", version: "1.0.0" },
    { capabilities: { resources: {}, tools: {} } }
  );

  // ── List tools ────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

  // ── List resources ────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: RESOURCES,
  }));

  // ── Read resource ─────────────────────────────────────────────────

  server.setRequestHandler(ReadResourceRequestSchema, (request) => {
    const { uri } = request.params;
    const payload = resourcePayload(uri);

    if (payload === null) {
      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    }

    return {
      contents: [
        {
          mimeType: "application/json",
          text: JSON.stringify(payload),
          uri,
        },
      ],
    };
  });

  // ── Call tool ─────────────────────────────────────────────────────

  // One handler per MCP tool name (generate/upscale/remove_background/vary/
  // history), each branching on its own args and error path; splitting
  // per-tool is the same out-of-scope structural refactor noted above.
  // oxlint-disable-next-line complexity, max-lines-per-function -- see comment above
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!args) {
      return toolError("INVALID_PARAMS", "No arguments provided", {
        suggestions: [
          "Pass an arguments object matching the tool input schema.",
        ],
      });
    }

    // ── generate ──────────────────────────────────────────────────

    if (name === "generate") {
      const {
        prompt,
        model = "gpt",
        aspect,
        resolution,
        preset,
        numImages = 1,
        transparent,
        outputFormat,
        seed,
        enableWebSearch,
        enableGoogleSearch,
        creative,
      } = parseArgs<{
        prompt: string;
        creative?: CreativeDirection;
        model?: string;
        aspect?: AspectRatio;
        resolution?: Resolution;
        preset?: string;
        numImages?: number;
        transparent?: boolean;
        outputFormat?: ImageOutputFormat;
        seed?: number;
        enableWebSearch?: boolean;
        enableGoogleSearch?: boolean;
      }>(args);

      const hasPreset = preset !== undefined && preset !== "";
      const resolvedAspect =
        (hasPreset ? PRESET_MAP[preset] : undefined) ?? aspect ?? "1:1";

      const result = await motif.generate({
        aspect: resolvedAspect,
        creative,
        enableGoogleSearch,
        enableWebSearch,
        model,
        numImages,
        outputFormat,
        prompt,
        resolution,
        seed,
        transparent,
      });

      if (result.isErr()) {
        return toolError("GENERATION_FAILED", result.error.message, {
          isRetriable: true,
          suggestions: [
            "Check that FAL_KEY is valid.",
            "Try a cheaper or simpler model if fal rejects the request.",
          ],
        });
      }

      const costEstimate = motif.estimateCost(model, undefined, numImages);

      const structured = {
        cost_estimate: costEstimate,
        images: result.value.images.map(imageContent),
        seed: result.value.seed,
      };

      return {
        content: [{ text: JSON.stringify(structured), type: "text" }],
        structuredContent: structured,
      };
    }

    // ── upscale ───────────────────────────────────────────────────

    if (name === "upscale") {
      const { imageUrl, model = "clarity" } = parseArgs<{
        imageUrl: string;
        model?: "clarity" | "crystal";
      }>(args);

      const result = await motif.upscale({ imageUrl, model });

      if (result.isErr()) {
        return toolError("UPSCALE_FAILED", result.error.message, {
          isRetriable: true,
          suggestions: ["Check the input image URL and retry."],
        });
      }

      const structured = {
        images: result.value.images.map(imageContent),
      };

      return {
        content: [{ text: JSON.stringify(structured), type: "text" }],
        structuredContent: structured,
      };
    }

    // ── remove_background ─────────────────────────────────────────

    if (name === "remove_background") {
      const { imageUrl, model = "rmbg" } = parseArgs<{
        imageUrl: string;
        model?: "rmbg" | "bria";
      }>(args);

      const result = await motif.removeBackground({ imageUrl, model });

      if (result.isErr()) {
        return toolError("REMOVE_BACKGROUND_FAILED", result.error.message, {
          isRetriable: true,
          suggestions: ["Check the input image URL and retry."],
        });
      }

      const structured = {
        images: result.value.images.map((img) => ({ url: img.url })),
      };

      return {
        content: [{ text: JSON.stringify(structured), type: "text" }],
        structuredContent: structured,
      };
    }

    // ── vary ──────────────────────────────────────────────────────

    if (name === "vary") {
      const {
        prompt,
        imageUrls,
        model = "gpt",
        inputFidelity,
        creative,
      } = parseArgs<{
        prompt: string;
        creative?: CreativeDirection;
        imageUrls: string[];
        model?: string;
        inputFidelity?: "low" | "high";
      }>(args);

      const result = await motif.generate({
        creative,
        editImageUrls: imageUrls,
        inputFidelity,
        model,
        prompt,
      });

      if (result.isErr()) {
        return toolError("VARIATION_FAILED", result.error.message, {
          isRetriable: true,
          suggestions: [
            "Check that each reference URL is reachable.",
            "Try a model that supports image editing.",
          ],
        });
      }

      const costEstimate = motif.estimateCost(model, undefined, 1);

      const structured = {
        cost_estimate: costEstimate,
        images: result.value.images.map(imageContent),
      };

      return {
        content: [{ text: JSON.stringify(structured), type: "text" }],
        structuredContent: structured,
      };
    }

    // ── history ───────────────────────────────────────────────────

    if (name === "history") {
      const { limit = 10, offset = 0 } = parseArgs<{
        limit?: number;
        offset?: number;
      }>(args);

      const structured = readHistory(limit, offset);

      return {
        content: [{ text: JSON.stringify(structured), type: "text" }],
        structuredContent: structured,
      };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  });

  return server;
};
