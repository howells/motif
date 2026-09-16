/**
 * Schema introspection for agent-first CLI design.
 *
 * `motif describe` returns full machine-readable schema for all commands.
 * `motif describe <command>` returns schema for a specific command.
 *
 * Schemas are resolved at runtime from the live model registry,
 * so they always reflect the current API version.
 */

import {
  ASPECT_RATIOS,
  CREATIVE_TAXONOMY,
  EDIT_CAPABLE_MODELS,
  describeModelOutput,
  losslessAvailability,
  modelOutput,
  GENERATION_MODELS,
  IMAGE_EDITING_TOP_20,
  IMAGE_TEXT_TO_IMAGE_TOP_20,
  LOOKS,
  MODELS,
  RESOLUTIONS,
  TASKS,
  TIERS,
  UTILITY_MODELS,
  VIDEO_IMAGE_TO_VIDEO_TOP_15,
  VIDEO_MODELS,
  VIDEO_TEXT_TO_VIDEO_TOP_15,
} from "@howells/motif-sdk";

import { ERROR_CATALOG } from "../utils/error-catalog";
import { emit } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { hasText } from "../utils/text";
import { PACKAGE_VERSION } from "../version";
import { verbFlags } from "./verbs/register-verb";
import { TASK_VERBS } from "./verbs/task-verbs";
import {
  COMMAND_TASKS,
  TASK_INDEX,
  commandTask,
  taskRouting,
} from "./verbs/tasks";
import { promptSource, usageLine } from "./verbs/verb-kit";

/**
 * Build creative direction properties for `motif describe` output.
 *
 * Looks and moods are described from their own SDK lists, so look-only
 * metadata (default aspect and model, whether a mood is accepted, whether the
 * look is experimental) never depends on probing an option's shape.
 */
function creativeSchemaProperties(): Record<string, object> {
  return {
    look: {
      description:
        "House look id. Sets the prompt register, and the default model and aspect when none is given",
      enum: LOOKS.map((look) => look.id),
      enumDescriptions: Object.fromEntries(
        LOOKS.map((look) => [
          look.id,
          {
            acceptsMood: look.acceptsMood,
            clause: look.clause,
            defaultAspect: look.aspect,
            defaultModel: look.model,
            description: look.description,
            experimental: look.experimental === true,
            label: look.label,
          },
        ])
      ),
      type: "string",
    },
    mood: {
      description:
        "Light mood id, appended after the look. null (or --no-mood) drops any mood, including a Series' pinned one. Flat looks refuse a mood",
      enum: CREATIVE_TAXONOMY.mood.map((mood) => mood.id),
      enumDescriptions: Object.fromEntries(
        CREATIVE_TAXONOMY.mood.map((mood) => [
          mood.id,
          {
            clause: mood.clause,
            description: mood.description,
            label: mood.label,
          },
        ])
      ),
      type: ["string", "null"],
    },
  };
}

/** Input fields every Task command takes. */
const TASK_INPUT_PROPERTIES = {
  params: {
    description:
      "Model-only request fields, sent as given. Needs model. CLI: repeat --param key=value; values parse as JSON when they can",
    type: "object",
  },
  seed: {
    description: "Reproducible seed, where the Model takes one",
    type: "integer",
  },
  tier: {
    default: "balanced",
    description: "Trade cost against quality when choosing the Model",
    enum: TIERS,
    type: "string",
  },
};

/** Output fields every Task command emits. */
const TASK_OUTPUT_PROPERTIES = {
  chosenBy: {
    description: "What chose the Model: ranking, model, look or pin",
    type: "string",
  },
  cost: {
    description: "USD, or null when the rate is metered or unknown",
    type: ["number", "null"],
  },
  costBasis: { enum: ["measured", "projected", "unknown"], type: "string" },
  model: { description: "The Model that ran", type: "string" },
  request: {
    description:
      "Dry run only: the request body, data URLs replaced by their size",
    type: "object",
  },
  task: { type: "string" },
  tier: { enum: TIERS, type: "string" },
};

/** JSON Schema for the generate command's input */
function generateSchema() {
  return {
    command: "generate",
    description: "Generate an image from a text prompt",
    input: {
      properties: {
        aspect: {
          default: "1:1",
          description: "Aspect ratio of the generated image",
          enum: ASPECT_RATIOS,
          type: "string",
        },
        editImages: {
          description:
            "Local file paths for reference/edit images. Uploaded automatically.",
          items: { type: "string" },
          type: "array",
        },
        ephemeral: {
          default: false,
          description:
            "Save output locally, send X-Fal-Store-IO: 0, skip Motif history, then delete fal request IO payloads when fal returns a request id",
          type: "boolean",
        },
        maskImageUrl: {
          description: "Mask image URL for supported edit/inpainting models",
          type: "string",
        },
        model: {
          description:
            "Run this Model instead of the ranked choice. The SDK resolves every request, this one included",
          enum: GENERATION_MODELS,
          enumDescriptions: Object.fromEntries(
            GENERATION_MODELS.map((m) => [
              m,
              {
                benchmark: MODELS[m]?.benchmark,
                falPricing: MODELS[m]?.falPricing,
                maxReferenceImages: MODELS[m]?.maxReferenceImages,
                name: MODELS[m]?.name,
                pricing: MODELS[m]?.pricing,
                supportedOutputFormats: MODELS[m]?.supportedOutputFormats,
                supportsAspect: MODELS[m]?.supportsAspect,
                supportsBackground: MODELS[m]?.supportsBackground,
                supportsEdit: MODELS[m]?.supportsEdit,
                supportsMaskImage: MODELS[m]?.supportsMaskImage,
                supportsResolution: MODELS[m]?.supportsResolution,
                transparencyRoute: MODELS[m]?.transparencyRoute,
              },
            ])
          ),
          type: "string",
        },
        ...TASK_INPUT_PROPERTIES,
        noOpen: {
          default: false,
          description: "Don't open image in viewer after generation",
          type: "boolean",
        },
        numImages: {
          default: 1,
          description: "Number of images to generate",
          maximum: 4,
          minimum: 1,
          type: "integer",
        },
        output: {
          description:
            "Output filename (must be within the git root, or CWD outside a repo). Auto-generated if omitted.",
          type: "string",
        },
        prompt: {
          description: "Text description of the image to generate",
          type: "string",
        },
        resolution: {
          default: "2K",
          description: "Output resolution (not all models support this)",
          enum: RESOLUTIONS,
          type: "string",
        },
        transparent: {
          default: false,
          description:
            "Transparent background PNG. Some Models route through OpenAI and need OPENAI_API_KEY. The saved PNG is checked for transparent pixels (TRANSPARENCY_MISSING otherwise).",
          type: "boolean",
        },
        ...creativeSchemaProperties(),
      },
      required: ["prompt"],
      type: "object",
    },
    mutating: true,
    output: {
      properties: {
        aspect: { type: "string" },
        historyRecorded: {
          description: "False for ephemeral generations",
          type: "boolean",
        },
        id: { description: "Generation ID (UUID)", type: "string" },
        images: {
          items: {
            properties: {
              height: { type: "integer" },
              path: { description: "Local file path", type: "string" },
              size: {
                description: 'Human-readable, e.g. "1.2MB"',
                type: "string",
              },
              width: { type: "integer" },
            },
            type: "object",
          },
          type: "array",
        },
        ...TASK_OUTPUT_PROPERTIES,
        payloadsDeleted: {
          description:
            "Whether Motif deleted fal request IO payloads after local download",
          type: "boolean",
        },
        prompt: { type: "string" },
        requestId: {
          description: "fal request id, included when fal returns one",
          type: "string",
        },
        resolution: { type: "string" },
        timestamp: { format: "date-time", type: "string" },
      },
      type: "object",
    },
    presets: {
      cover: {
        aspect: "2:3",
        description: "Kindle/eBook cover",
        resolution: "2K",
      },
      feed: { aspect: "4:5", description: "Instagram Feed" },
      landscape: { aspect: "16:9", description: "Landscape" },
      og: { aspect: "16:9", description: "Open Graph / social share" },
      portrait: { aspect: "2:3", description: "Portrait" },
      reel: { aspect: "9:16", description: "Instagram Reel" },
      square: { aspect: "1:1", description: "Square" },
      story: { aspect: "9:16", description: "Instagram/TikTok Story" },
      ultra: {
        aspect: "21:9",
        description: "Ultra-wide banner",
        resolution: "2K",
      },
      wallpaper: {
        aspect: "9:16",
        description: "iPhone wallpaper",
        resolution: "2K",
      },
      wide: { aspect: "21:9", description: "Cinematic wide" },
    },
    supports_dry_run: true,
  };
}

function lastSchema() {
  return {
    command: "last",
    description: "Show information about the last generation",
    input: { properties: {}, type: "object" },
    mutating: false,
    output: {
      properties: {
        aspect: { type: "string" },
        cost: { type: "number" },
        id: { type: "string" },
        model: { type: "string" },
        output: { type: "string" },
        prompt: { type: "string" },
        resolution: { type: "string" },
        timestamp: { format: "date-time", type: "string" },
      },
      type: "object",
    },
  };
}

function historySchema() {
  return {
    command: "history",
    description: "List generation history",
    input: {
      properties: {
        limit: {
          default: 10,
          description: "Number of entries to return",
          type: "integer",
        },
        offset: {
          default: 0,
          description: "Skip first N entries",
          type: "integer",
        },
      },
      type: "object",
    },
    mutating: false,
    output: {
      properties: {
        costs: {
          properties: {
            allTime: { type: "number" },
            session: { type: "number" },
            today: { type: "number" },
          },
          type: "object",
        },
        generations: {
          items: { $ref: "#/commands/last/output" },
          type: "array",
        },
        total: { type: "integer" },
      },
      type: "object",
    },
  };
}

function varySchema() {
  return {
    command: "vary",
    description: TASKS.vary.summary,
    input: {
      properties: {
        ...TASK_INPUT_PROPERTIES,
        imagePath: {
          description: "Image to vary. Falls back to the last generation.",
          type: "string",
        },
        look: creativeSchemaProperties().look,
        model: { enum: EDIT_CAPABLE_MODELS, type: "string" },
        mood: creativeSchemaProperties().mood,
        numImages: { default: 1, maximum: 4, minimum: 1, type: "integer" },
        prompt: {
          description:
            "What the variations should be (default: the source generation's prompt)",
          type: "string",
        },
      },
      type: "object",
    },
    mutating: true,
    output: {
      properties: {
        varyModel: {
          description:
            "reused: the source generation's Model, still ranked for vary; resolved: chosen afresh",
          enum: ["reused", "resolved"],
          type: "string",
        },
      },
      type: "object",
    },
    supports_dry_run: true,
    usage: 'motif vary [image] --prompt "..." -n 2',
  };
}

function sheetSchema() {
  return {
    command: "sheet",
    description:
      "Lay images out on one contact sheet: each cell fitted into a 512 px square on a warm off-white ground, captioned from history (look, mood, cost) or with the filename",
    input: {
      properties: {
        cols: {
          description: "Columns (default: roughly square, ceil(sqrt(count)))",
          maximum: 20,
          minimum: 1,
          type: "integer",
        },
        files: {
          description:
            "Image paths to include (png, jpg, webp). Pass these or --last, not both.",
          items: { type: "string" },
          type: "array",
        },
        last: {
          description:
            "Use the newest n history images still on disk, oldest first",
          maximum: 100,
          minimum: 1,
          type: "integer",
        },
        noOpen: {
          default: false,
          description: "Don't open the sheet afterwards",
          type: "boolean",
        },
        output: {
          description:
            "Output file (.png, .jpg or .webp), within the git root (or CWD outside a repo). Default: sheet-<timestamp>.png",
          type: "string",
        },
      },
      type: "object",
    },
    mutating: true,
    output: {
      properties: {
        cols: { type: "integer" },
        count: { type: "integer" },
        height: { type: "integer" },
        path: { type: "string" },
        width: { type: "integer" },
      },
      type: "object",
    },
    supports_dry_run: false,
    usage: [
      "motif sheet a.png b.png c.png -o sheet.png --no-open --format json",
      "motif sheet --last 6 --cols 3 --no-open --format json --fields path,count",
    ],
  };
}

function describeSchema() {
  return {
    command: "describe",
    description: "Introspect CLI schema (this command)",
    input: {
      properties: {
        command: {
          description: "Specific command to describe (omit for all)",
          enum: [...Object.keys(COMMAND_SCHEMAS), "tasks"],
          type: "string",
        },
      },
      type: "object",
    },
    mutating: false,
  };
}

function seriesSchema() {
  return {
    command: "series",
    description:
      "Manage reusable image series and run themed multi-image generation plans with shared style, tone, references, and history.",
    examples: [
      'motif series run "brutalist architecture" --count 6 --dry-run --format json',
      'motif series create "Luna Adventure" --style "watercolor children\'s book" -m banana',
      'motif series gen luna-adventure "Luna enters the forest" --refs character,location --dry-run',
    ],
    input: {
      properties: {
        aspect: {
          default: "1:1",
          enum: ASPECT_RATIOS,
          type: "string",
        },
        command: {
          description: "Series command for stdin JSON payloads",
          enum: [
            "series-create",
            "series-list",
            "series-show",
            "series-ref-add",
            "series-ref-remove",
            "series-generate",
            "series-run",
            "series-history",
            "series-delete",
          ],
          type: "string",
        },
        count: {
          default: 4,
          description: "Number of scene prompts/images in a series run",
          maximum: 24,
          minimum: 1,
          type: "integer",
        },
        dryRun: {
          default: false,
          description:
            "Plan prompts, references, and cost without calling fal or requiring FAL_KEY.",
          type: "boolean",
        },
        model: {
          description:
            "Run this Model instead of the ranked choice for every image in the series.",
          enum: GENERATION_MODELS,
          type: "string",
        },
        noOpen: { default: false, type: "boolean" },
        numImages: {
          description: "Alias for count in stdin JSON series-run payloads.",
          maximum: 24,
          minimum: 1,
          type: "integer",
        },
        prompt: {
          description:
            "Single scene prompt for series gen, or alias for theme in stdin series-run.",
          type: "string",
        },
        refs: {
          description:
            "Comma-separated reference tags to include from an existing series.",
          type: "string",
        },
        resolution: {
          default: "2K",
          enum: RESOLUTIONS,
          type: "string",
        },
        series: {
          description:
            "Existing series slug. Omit for series run to auto-create or reuse a series from the theme when generating.",
          type: "string",
        },
        stylePrompt: {
          description:
            "Shared style/tone prompt stored on a series or applied to a series run.",
          type: "string",
        },
        theme: {
          description:
            'High-level creative brief for series run, e.g. "brutalist architecture".',
          type: "string",
        },
      },
      type: "object",
    },
    mutating: true,
    output: {
      properties: {
        command: { type: "string" },
        cost: { type: "number" },
        estimatedCost: { type: ["number", "null"] },
        images: {
          description: "Saved image outputs for non-dry-run series runs.",
          type: "array",
        },
        scenes: {
          description:
            "Series run plan with one scene prompt per generated image.",
          items: {
            properties: {
              index: { type: "integer" },
              prompt: { type: "string" },
              scenePrompt: { type: "string" },
            },
            type: "object",
          },
          type: "array",
        },
        series: { type: ["string", "null"] },
        stylePrompt: { type: "string" },
        theme: { type: "string" },
      },
      type: "object",
    },
    subcommands: [
      "create",
      "list",
      "show",
      "ref-add",
      "ref-remove",
      "gen",
      "run",
      "history",
      "delete",
    ],
    subcommandTasks: { run: taskRouting(commandTask("series run")) },
    supports_dry_run: true,
  };
}

/**
 * The Task verbs, described from their own definitions: an optional source
 * that falls back to the last generation, the Task's modes as flags, `-o`
 * taking a file or a trailing-slash directory, and a dry run that prices the
 * call first.
 */
function taskVerbSchema(
  definition: (typeof TASK_VERBS)[number]
): Record<string, unknown> {
  const task = TASKS[definition.task];
  const modes: readonly { id: string; summary: string }[] =
    "modes" in task ? task.modes : [];
  const writesFiles = definition.writesFiles?.() ?? true;
  const promptFrom = promptSource(definition);
  const flags = Object.fromEntries(
    verbFlags(definition).map((option) => [
      option.attributeName(),
      {
        description: `${option.description} (CLI: ${option.long ?? option.flags})`,
        ...(option.argChoices !== undefined && { enum: option.argChoices }),
        type: option.required || option.optional ? "string" : "boolean",
      },
    ])
  );
  return {
    command: definition.command,
    description: task.summary,
    usage: usageLine(definition),
    input: {
      properties: {
        ...TASK_INPUT_PROPERTIES,
        dryRun: { default: false, type: "boolean" },
        imagePath: {
          description:
            definition.sourceKind === "image-or-video"
              ? "Source image or video path. Falls back to the last generation when omitted."
              : "Source image path. Falls back to the last generation when omitted.",
          type: "string",
        },
        ...(modes.length > 0 && {
          mode: {
            description: `One mode at a time, passed as a flag such as --${modes[0]?.id ?? "mode"}`,
            enum: modes.map((mode) => mode.id),
            enumDescriptions: Object.fromEntries(
              modes.map((mode) => [mode.id, mode.summary])
            ),
            type: "string",
          },
        }),
        ...(promptFrom !== undefined && {
          prompt: {
            description: `Prompt: ${promptFrom}`,
            type: "string",
          },
        }),
        ...flags,
        noOpen: { default: false, type: "boolean" },
        output: {
          description:
            "Output file (within the git root, or CWD outside a repo), or a directory ending in / to receive every file.",
          type: "string",
        },
      },
      type: "object",
    },
    mutating: writesFiles,
    output: {
      properties: {
        ...TASK_OUTPUT_PROPERTIES,
        ...(writesFiles && {
          files: { items: { type: "object" }, type: "array" },
          height: { type: "integer" },
          path: { type: "string" },
          size: { type: "string" },
          width: { type: "integer" },
        }),
      },
      type: "object",
    },
    supports_dry_run: true,
  };
}

const VERB_SCHEMAS: Record<string, () => Record<string, unknown>> =
  Object.fromEntries(
    TASK_VERBS.map((definition) => [
      definition.command,
      () => taskVerbSchema(definition),
    ])
  );

const COMMAND_SCHEMAS: Record<string, () => Record<string, unknown>> = {
  ...VERB_SCHEMAS,
  describe: describeSchema,
  errors: () => ({
    command: "errors",
    description: "Inspect machine-readable CLI error metadata",
    errors: ERROR_CATALOG,
    mutating: false,
    output: {
      properties: {
        errors: {
          description:
            "Known error codes keyed by code, with status, retryability, local doc URI, and recovery suggestions.",
          type: "object",
        },
      },
      type: "object",
    },
  }),
  generate: generateSchema,
  history: historySchema,
  last: lastSchema,
  series: seriesSchema,
  sheet: sheetSchema,
  vary: varySchema,
};

/**
 * A command's schema with its task routing placed straight after its
 * description, where a caller reading top down meets it first.
 */
function describeCommand(
  name: string,
  schemaFn: () => Record<string, unknown>
): Record<string, unknown> {
  const schema = schemaFn();
  return {
    command: schema.command,
    description: schema.description,
    ...taskRouting(commandTask(name)),
    ...schema,
  };
}

/** The task table alone: `motif --describe tasks`. */
function tasksSchema() {
  return {
    command: "tasks",
    description:
      "Which command does which job. `tasks` maps a task word to its command; `commands` says when to use each, what to use instead, and how to invoke it.",
    tasks: TASK_INDEX,
    commands: Object.fromEntries(
      COMMAND_TASKS.map((row) => [
        row.command,
        { summary: row.summary, usage: row.usage, ...taskRouting(row) },
      ])
    ),
  };
}

/** Full CLI schema with all commands, models, and runtime state */
function fullSchema() {
  return {
    // First, so the opening bytes of a large schema are the routing table.
    tasks: TASK_INDEX,
    commands: Object.fromEntries(
      Object.entries(COMMAND_SCHEMAS).map(([name, fn]) => [
        name,
        describeCommand(name, fn),
      ])
    ),
    description: "fal.ai image generation CLI",
    enums: {
      aspect_ratios: ASPECT_RATIOS,
      generation_models: GENERATION_MODELS,
      resolutions: RESOLUTIONS,
      utility_models: UTILITY_MODELS,
      video_models: VIDEO_MODELS,
    },
    errors: ERROR_CATALOG,
    global_flags: {
      "--dry-run":
        "Validate inputs and show what would happen without making API calls.",
      "--ephemeral":
        "Save output locally, disable fal IO storage where supported, skip Motif history, and delete fal request payloads after download.",
      "--fields <field1,field2,...>":
        "Comma-separated field names to include in output. Omit for all fields.",
      "--format <json|human|ndjson>":
        "Output format. Default: human (TTY) or json (piped).",
      "--no-open": "Don't open image in viewer after generation.",
    },
    input_modes: {
      combined: "Stdin JSON for base config, flags override specific fields.",
      flags: "Traditional CLI flags (e.g. motif 'a cat' -m gpt --og)",
      stdin_json:
        'Pipe a JSON payload to stdin: echo \'{"prompt":"a cat","model":"gpt"}\' | motif',
    },
    leaderboards: {
      image_editing_top_20: IMAGE_EDITING_TOP_20,
      image_text_to_image_top_20: IMAGE_TEXT_TO_IMAGE_TOP_20,
      video_image_to_video_top_15: VIDEO_IMAGE_TO_VIDEO_TOP_15,
      video_text_to_video_top_15: VIDEO_TEXT_TO_VIDEO_TOP_15,
    },
    models: Object.fromEntries(
      Object.entries(MODELS).map(([key, config]) => [
        key,
        {
          benchmark: config.benchmark,
          capabilities: {
            aspect: config.supportsAspect,
            edit: config.supportsEdit,
            guidanceScale: config.supportsGuidanceScale,
            inferenceSteps: config.supportsInferenceSteps,
            maxReferenceImages: config.maxReferenceImages,
            numImages: config.supportsNumImages,
            outputFormat: config.supportsOutputFormat,
            resolution: config.supportsResolution,
            safetyTolerance: config.supportsSafetyTolerance,
            seed: config.supportsSeed,
            supportedOutputFormats: config.supportedOutputFormats,
            webSearch: config.supportsWebSearch,
          },
          falPricing: config.falPricing,
          name: config.name,
          // What comes back, measured from real bytes, not what the endpoint
          // accepts. `capabilities.outputFormat` says whether the argument is
          // allowed; this says whether a lossless file is obtainable at all and
          // what arrives if you ask for nothing.
          output: modelOutput(key)
            ? {
                ...modelOutput(key),
                lossless: losslessAvailability(key),
                summary: describeModelOutput(key),
              }
            : undefined,
          pricing: config.pricing,
          type: config.type,
        },
      ])
    ),
    name: "motif",
    security_posture:
      "The agent is not a trusted operator. All inputs are validated. Output paths must stay inside the git root of the current directory (or the current directory outside a repo). Use --dry-run before mutating commands.",
    version: PACKAGE_VERSION,
  };
}

/** Run the describe command */
export function runDescribe(
  commandName: string | undefined,
  options: EmitOptions
): void {
  if (commandName === "tasks") {
    emit(tasksSchema(), options);
  } else if (hasText(commandName)) {
    const schemaFn = COMMAND_SCHEMAS[commandName];
    if (schemaFn === undefined) {
      throw new Error(
        `Unknown command: ${commandName}. Available: ${[...Object.keys(COMMAND_SCHEMAS), "tasks"].join(", ")}`
      );
    }
    emit(describeCommand(commandName, schemaFn), options);
  } else {
    emit(fullSchema(), options);
  }
}
