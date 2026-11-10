/**
 * What each command prints and says about itself, which commander does not
 * know: output fields, descriptions that run longer than a help line,
 * examples, and the commands that are flags rather than subcommands.
 */

import { FORMAT_PRESETS, TASKS, TIERS } from "@howells/motif-sdk";

import { ERROR_CATALOG } from "../../utils/error-catalog";
import type { Schema } from "./notes";

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

/** What a Task verb emits; the file fields only for a verb that writes one. */
export function verbOutput(writesFiles: boolean): Schema {
  return {
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
  };
}

/** The format presets as `--describe` lists them, sorted by id. */
function formatPresets() {
  return Object.fromEntries(
    Object.entries(FORMAT_PRESETS)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([id, { aspect, description, resolution }]) => [
        id,
        {
          aspect,
          description,
          ...(resolution !== undefined && { resolution }),
        },
      ])
  );
}

/**
 * Per command: the prose, examples and output that are not derived. A command
 * with no entry here has only what its options and the Task registry give.
 */
export const COMMAND_PROSE: Record<string, Schema> = {
  generate: {
    description: "Generate an image from a text prompt",
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
    presets: formatPresets(),
    required: ["prompt"],
  },
  resume: {
    output: {
      description:
        "Collecting a run emits what the original command emitted, with the same fields; see that command's output. Without a request id it lists pending runs. A dry run reports what would be collected.",
      properties: {
        command: { type: "string" },
        dryRun: { type: "boolean" },
        output: {
          description: "Where the files go, or null for a run that writes none",
          type: ["string", "null"],
        },
        pending: {
          description: "Listing only: each run that can be collected",
          items: {
            properties: {
              command: { type: "string" },
              model: { type: "string" },
              output: { type: ["string", "null"] },
              requestId: { type: "string" },
              submittedAt: { format: "date-time", type: "string" },
              task: { type: "string" },
            },
            type: "object",
          },
          type: "array",
        },
        requestId: { description: "Dry run only", type: "string" },
        resumes: {
          description: "Dry run only: the command the run came from",
          type: "string",
        },
        total: { description: "Listing only", type: "integer" },
      },
      type: "object",
    },
    usage: [
      "motif resume",
      "motif resume <requestId> --format json",
      "motif resume <requestId> --dry-run --format json",
    ],
  },
  series: {
    description:
      "Manage reusable image series and run themed multi-image generation plans with shared style, tone, references, and history.",
    examples: [
      'motif series run "brutalist architecture" --count 6 --dry-run --format json',
      'motif series create "Luna Adventure" --style "watercolor children\'s book" -m banana',
      'motif series gen luna-adventure "Luna enters the forest" --refs character,location --dry-run',
    ],
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
  },
  sheet: {
    description:
      "Lay images out on one contact sheet: each cell fitted into a 512 px square on a warm off-white ground, captioned from history (look, mood, cost) or with the filename",
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
    usage: [
      "motif sheet a.png b.png c.png -o sheet.png --format json",
      "motif sheet --last 6 --cols 3 --format json --fields path,count",
    ],
  },
  vary: {
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
    usage: 'motif vary [image] --prompt "..." -n 2',
  },
};

/** The flags that are commands: their inputs are root flags, not options here. */
export const FLAG_COMMANDS: Record<string, Schema> = {
  errors: {
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
  },
  last: {
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
  },
};

/** The history command's output, which is the one flag command with input. */
export const HISTORY_OUTPUT: Schema = {
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
};

/** A Task verb's description is its Task's summary. */
export function verbDescription(task: keyof typeof TASKS): string {
  return TASKS[task].summary;
}
