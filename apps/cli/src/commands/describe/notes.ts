/**
 * What commander does not know about a command's inputs: the bounds, defaults
 * and prose a caller needs beyond a flag's help line.
 *
 * Which inputs a command has comes from its commander options and arguments
 * (see `derive.ts`); these notes only describe an input that exists. A note
 * naming an input the command does not take fails `--describe` loudly, so a
 * schema entry cannot outlive its flag.
 */

import {
  ASPECT_RATIOS,
  CREATIVE_TAXONOMY,
  FORMAT_PRESETS,
  LOOKS,
  RESOLUTIONS,
  TIERS,
} from "@howells/motif-sdk";

import { PRESET_IDS } from "../../utils/presets";
import { taskModelIds } from "./tasks";

export type Schema = Record<string, unknown>;

/** A command's notes, keyed by the input's property name. */
export type Notes = Record<string, Schema>;

/**
 * Look and mood properties, described from their own SDK lists, so look-only
 * metadata (default aspect and model, whether a mood is accepted, whether the
 * look is experimental) never depends on probing an option's shape.
 */
function creativeNotes(): Notes {
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

/** Inputs more than one command takes, read the same way everywhere. */
export const COMMON_NOTES: Notes = {
  dryRun: { default: false, type: "boolean" },
  limit: {
    default: 10,
    description: "Number of entries to return",
    type: "integer",
  },
  offset: { default: 0, description: "Skip first N entries", type: "integer" },
  open: { default: false, type: "boolean" },
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

/** The Model ids `-m` accepts for a command: its Task's, or generation's. */
export function modelNote(task: Parameters<typeof taskModelIds>[0]): Schema {
  return {
    description: "Run this Model instead of the ranked choice",
    enum: taskModelIds(task),
    type: "string",
  };
}

/** Notes for the Task verbs' own inputs. */
export const VERB_NOTES: Notes = {
  output: {
    description:
      "Output file (within the git root, or CWD outside a repo), or a directory ending in / to receive every file.",
    type: "string",
  },
};

/** Notes per command. Keys are the command's property names. */
export const COMMAND_NOTES: Record<string, Notes> = {
  generate: {
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
    markupImageUrl: {
      description:
        "Local path of a transparent PNG of annotations (arrows, circles, notes) the size of the first edit image, guiding its edit. Needs editImages; can't join a mask",
      type: "string",
    },
    maskImageUrl: {
      description: "Mask image URL for supported edit/inpainting models",
      type: "string",
    },
    model: {
      ...modelNote("generate"),
      description:
        "Run this Model instead of the ranked choice. The SDK resolves every request, this one included",
    },
    negativePrompt: {
      description: "Negative prompt: what not to include",
      type: "string",
    },
    numImages: {
      default: 1,
      description: "Number of images to generate",
      maximum: 4,
      minimum: 1,
      type: "integer",
    },
    open: {
      default: false,
      description: "Open the image in a viewer after generation",
      type: "boolean",
    },
    output: {
      description:
        "Output filename (must be within the git root, or CWD outside a repo). Auto-generated if omitted.",
      type: "string",
    },
    outputFormat: {
      description:
        "Image format: jpeg, png, webp, gif, svg. Default png; an -o extension also asks for one. Refused where the Model cannot make it",
      type: "string",
    },
    preset: {
      description:
        "Format preset: sets the aspect and, for some, the resolution. CLI: the preset's own flag, such as --og",
      enum: PRESET_IDS,
      type: "string",
    },
    prompt: {
      description: "Text description of the image to generate",
      type: "string",
    },
    resolution: {
      default: "2K",
      description:
        "Resolution tier, not exact pixels: what it means depends on the Model. Each Model's `sizing` in `--describe tasks` says; `--dry-run` reports the `size` that will be requested.",
      enum: RESOLUTIONS,
      type: "string",
    },
    transparent: {
      default: false,
      description:
        "Transparent background PNG. The saved PNG is checked for transparent pixels (TRANSPARENCY_MISSING otherwise).",
      type: "boolean",
    },
    ...creativeNotes(),
  },
  series: {
    aspect: { default: "1:1", enum: ASPECT_RATIOS, type: "string" },
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
      ...modelNote("generate"),
      description:
        "Run this Model instead of the ranked choice for every image in the series.",
    },
    numImages: {
      description: "Number of images to generate (series gen)",
      maximum: 4,
      minimum: 1,
      type: "integer",
    },
    prompt: {
      description: "Scene prompt: the second argument of series gen.",
      type: "string",
    },
    refs: {
      description:
        "Comma-separated reference tags to include from an existing series.",
      type: "string",
    },
    resolution: { default: "2K", enum: RESOLUTIONS, type: "string" },
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
    ...creativeNotes(),
  },
  sheet: {
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
    open: {
      default: false,
      description: "Open the sheet in a viewer",
      type: "boolean",
    },
    output: {
      description:
        "Output file (.png, .jpg or .webp), within the git root (or CWD outside a repo). Default: sheet-<timestamp>.png",
      type: "string",
    },
  },
  vary: {
    imagePath: {
      description: "Image to vary. Falls back to the last generation.",
      type: "string",
    },
    model: { enum: taskModelIds("vary"), type: "string" },
    numImages: { default: 1, maximum: 4, minimum: 1, type: "integer" },
    prompt: {
      description:
        "What the variations should be (default: the source generation's prompt)",
      type: "string",
    },
    ...creativeNotes(),
  },
};

/** The property names generate's flags go by: its stdin JSON field names. */
export const GENERATE_KEYS: Record<string, string> = {
  edit: "editImages",
  markup: "markupImageUrl",
  mask: "maskImageUrl",
  negative: "negativePrompt",
  ...Object.fromEntries(
    Object.keys(FORMAT_PRESETS).map((id) => [id, "preset"])
  ),
};

/** The property names every command's flags and arguments go by. */
export const COMMON_KEYS: Record<string, string> = {
  image: "imagePath",
  num: "numImages",
  param: "params",
  slug: "series",
  style: "stylePrompt",
};

/** Inputs every command takes as global flags, not as part of its own input. */
export const GLOBAL_INPUTS = new Set(["fields", "format"]);

/**
 * The flags on generate that answer instead of generating. They are the
 * commands `describe`, `history` and `last`, not inputs to an image.
 */
export const ANSWER_FLAGS = ["describe", "history", "last", "limit", "offset"];

/** The property name each of a command's flags and arguments goes by. */
export function propertyKeys(command: string): Record<string, string> {
  return { ...COMMON_KEYS, ...(command === "generate" ? GENERATE_KEYS : {}) };
}
