/**
 * One verb per Task. Each definition says which positionals the verb reads,
 * which mode flags it offers, and which extra flags become TaskInput fields;
 * `registerTaskVerb` in `register-verb.ts` turns a definition into a
 * commander command over the `runTask` kernel.
 */

import {
  ASPECT_RATIOS,
  CREATIVE_TAXONOMY,
  FORMAT_PRESETS,
} from "@howells/motif-sdk";
import type {
  AspectRatio,
  Resolution,
  TaskInput,
  TaskOutput,
} from "@howells/motif-sdk";

import { handleError } from "../../utils/errors";
import {
  parseIntegerOption,
  parseNumberOption,
  validateEnumOption,
} from "../../utils/input";
import { imageSource } from "../../utils/motif-client";
import type { OutputFormat } from "../../utils/output";
import { hasText } from "../../utils/text";
import { parseBoxes, parseMargin, parseSizes } from "./pixel-options";
import { exclusiveFlag } from "./shared";
import type { VerbOptions } from "./shared";
import { always, invalid, never, parsed, stringOption } from "./verb-kit";
import type { VerbDefinition } from "./verb-kit";

async function maskInput(
  options: VerbOptions,
  format: OutputFormat
): Promise<TaskInput> {
  const mask = stringOption(options, "mask");
  if (mask === undefined) {
    return {};
  }
  try {
    return { mask: await imageSource(mask) };
  } catch (error) {
    handleError(error, "INVALID_IMAGE_PATH", format);
  }
}

const REFRAME_PRESETS = [
  "cover",
  "landscape",
  "og",
  "portrait",
  "square",
  "story",
  "wide",
] as const;

const OUTPUT_FORMATS = ["jpeg", "png", "webp"] as const;

/** Reframe's target: a preset or `-a`, one or the other. */
function reframeTarget(
  options: VerbOptions,
  format: OutputFormat
): { aspect?: AspectRatio; resolution?: Resolution } {
  const preset = exclusiveFlag(options, REFRAME_PRESETS, "reframe", format);
  const aspect = stringOption(options, "aspect");
  if (preset !== undefined && aspect !== undefined) {
    invalid(
      `motif reframe takes a preset or -a, not both; got --${preset} -a ${aspect}`,
      format
    );
  }
  if (preset !== undefined) {
    const target = FORMAT_PRESETS[preset];
    if (target === undefined) {
      invalid(`No format preset named ${preset}`, format);
    }
    return {
      aspect: target.aspect,
      ...(target.resolution !== undefined && { resolution: target.resolution }),
    };
  }
  if (aspect === undefined) {
    return {};
  }
  return {
    aspect: parsed(format, () =>
      validateEnumOption(aspect, ASPECT_RATIOS, "aspect")
    ),
  };
}

function askData(output: TaskOutput): Record<string, unknown> {
  const { data } = output;
  return typeof data.output === "string"
    ? { answer: data.output, ...data }
    : data;
}

/**
 * The answer alone, so it can be read or piped. Modes that locate things
 * rather than answer fall back to what they found, since printing nothing
 * would read as a failure.
 */
function renderAnswer(output: TaskOutput): string | undefined {
  const { data } = output;
  if (typeof data.output === "string" && data.output.trim() !== "") {
    return data.output.trim();
  }
  const located = data.objects ?? data.points;
  return JSON.stringify(located ?? data, null, 2);
}

/** `--mood <id>`, checked against the mood ids. */
function moodInput(options: VerbOptions, format: OutputFormat): TaskInput {
  const mood = stringOption(options, "mood");
  if (mood === undefined) {
    return {};
  }
  const ids = CREATIVE_TAXONOMY.mood.map((option) => option.id);
  return { mood: parsed(format, () => validateEnumOption(mood, ids, "mood")) };
}

/** `--like <path>`, the one style Reference restyle needs. */
async function likeInput(
  options: VerbOptions,
  format: OutputFormat
): Promise<TaskInput> {
  const like = stringOption(options, "like");
  if (like === undefined) {
    invalid(
      "motif restyle needs a style reference: motif restyle [image] --like <image>",
      format
    );
  }
  try {
    return { references: [await imageSource(like)] };
  } catch (error) {
    handleError(error, "INVALID_IMAGE_PATH", format);
  }
}

export const TASK_VERBS: readonly VerbDefinition[] = [
  {
    command: "animate",
    extension: ".mp4",
    input: (options, format) => ({
      ...(hasText(stringOption(options, "duration")) && {
        duration: parsed(format, () =>
          parseIntegerOption(
            stringOption(options, "duration") ?? "",
            "duration",
            {
              min: 1,
            }
          )
        ),
      }),
      ...(hasText(stringOption(options, "negative")) && {
        negativePrompt: stringOption(options, "negative"),
      }),
    }),
    modes: [],
    options: (command) =>
      command
        .option("--duration <s>", "Clip length in seconds")
        .option("--negative <text>", "What the motion should avoid"),
    promptFirst: always,
    sourceKind: "image",
    task: "animate",
    usage: "<prompt> [image]",
    verb: "Animating",
  },
  {
    command: "ask",
    data: askData,
    modes: [
      { description: "Caption the image", mode: "caption" },
      {
        description: "Return boxes around this thing",
        mode: "detect",
        value: "thing",
        valueIsPrompt: true,
      },
      {
        description: "Return a point on every instance of this thing",
        mode: "point",
        value: "thing",
        valueIsPrompt: true,
      },
      { description: "Transcribe the text in the image", mode: "read" },
      { description: "Say whether the image is safe for work", mode: "safe" },
    ],
    promptFirst: (mode) => mode === undefined,
    quiet: true,
    render: renderAnswer,
    sourceKind: "image",
    task: "ask",
    usage: "[question] [image]",
    verb: "Asking",
    writesFiles: never,
  },
  {
    command: "cutout",
    input: (options, format) => {
      const outputFormat = stringOption(options, "outputFormat");
      return outputFormat === undefined
        ? {}
        : {
            outputFormat: parsed(format, () =>
              validateEnumOption(outputFormat, OUTPUT_FORMATS, "output format")
            ),
          };
    },
    modes: [],
    options: (command) =>
      command.option("--output-format <format>", "jpeg, png or webp"),
    promptFirst: never,
    sourceKind: "image-or-video",
    task: "cutout",
    usage: "[image-or-video]",
    verb: "Cutting out",
  },
  {
    command: "erase",
    input: async (options, format, mode) => {
      if (mode === "with" && stringOption(options, "mask") === undefined) {
        invalid(
          "motif erase --with fills a masked region: pass --mask <path>",
          format
        );
      }
      const boxes = stringOption(options, "boxes");
      return {
        ...(await maskInput(options, format)),
        ...(boxes !== undefined && {
          boxes: parsed(format, () => parseBoxes(boxes)),
        }),
      };
    },
    modes: [
      {
        description: "Remove whatever falls inside these boxes, in pixels",
        mode: "boxes",
        value: "x,y,w,h;...",
      },
      { description: "Remove all rendered text", mode: "text" },
      {
        description: "Fill the masked region with this, described in words",
        mode: "with",
        value: "fill",
        valueIsPrompt: true,
      },
    ],
    options: (command) =>
      command.option("--mask <path>", "Mask image: white marks what to remove"),
    promptFirst: (mode, options) =>
      mode === undefined && stringOption(options, "mask") === undefined,
    sourceKind: "image",
    task: "erase",
    usage: "[what] [image]",
    verb: "Erasing",
  },
  {
    command: "layers",
    modes: [
      { description: "Separate the text from the artwork", mode: "text" },
    ],
    promptFirst: never,
    sourceKind: "image",
    task: "layers",
    usage: "[image]",
    verb: "Splitting into layers",
  },
  {
    command: "map",
    modes: [
      { description: "A soft edge map", mode: "edges" },
      { description: "A line-art map", mode: "lineart" },
      { description: "Straight line segments", mode: "lines" },
      { description: "Metric depth, in real distances", mode: "metric" },
      { description: "A surface normal map", mode: "normals" },
      { description: "Body, hand and face pose skeletons", mode: "pose" },
      { description: "A scribble-style map", mode: "scribble" },
      { description: "A segmentation map", mode: "segments" },
    ],
    promptFirst: never,
    sourceKind: "image",
    task: "map",
    usage: "[image]",
    verb: "Mapping",
  },
  {
    command: "material",
    modes: [
      {
        description: "Extract a tiling material from this region",
        mode: "extract",
        value: "region",
        valueIsPrompt: true,
      },
    ],
    promptFirst: never,
    sourceKind: "image",
    task: "material",
    usage: "[image]",
    verb: "Making material maps",
  },
  {
    command: "mesh",
    extension: ".glb",
    modes: [
      { description: "Reconstruct a human body", mode: "body" },
      { description: "Reconstruct several prompted objects", mode: "objects" },
    ],
    promptFirst: never,
    sourceKind: "image",
    task: "mesh",
    usage: "[image]",
    verb: "Making a mesh",
  },
  {
    command: "reframe",
    input: (options, format, mode) => {
      const margin = stringOption(options, "margin");
      const sizes = stringOption(options, "sizes");
      return {
        ...(mode === undefined ? reframeTarget(options, format) : {}),
        ...(margin !== undefined && {
          margin: parsed(format, () => parseMargin(margin)),
        }),
        ...(sizes !== undefined && {
          sizes: parsed(format, () => parseSizes(sizes)),
        }),
      };
    },
    modes: [
      {
        description: "Extend by pixels: one number, or top,right,bottom,left",
        mode: "margin",
        value: "px",
      },
      {
        description: "Several target sizes at once, e.g. 1080x1920,1200x630",
        mode: "sizes",
        value: "WxH,...",
      },
    ],
    options: (command) =>
      command
        .option(
          "-a, --aspect <ratio>",
          `Target ratio (${ASPECT_RATIOS.join(", ")})`
        )
        .option("--cover", "Kindle/eBook cover: 2:3")
        .option("--landscape", "Landscape: 16:9")
        .option("--og", "Open Graph / social share: 16:9")
        .option("--portrait", "Portrait: 2:3")
        .option("--square", "Square: 1:1")
        .option("--story", "Instagram/TikTok Story: 9:16")
        .option("--wide", "Cinematic wide: 21:9"),
    promptFirst: never,
    sourceKind: "image",
    task: "reframe",
    usage: "[image]",
    verb: "Reframing",
  },
  {
    command: "relight",
    input: async (options, format) => ({
      ...(await maskInput(options, format)),
      ...moodInput(options, format),
    }),
    modes: [
      { description: "Restore natural, even lighting", mode: "even" },
      { description: "Strip baked-in light and shadow", mode: "flat" },
    ],
    options: (command) =>
      command
        .option(
          "--mood <id>",
          `Light a house mood: ${CREATIVE_TAXONOMY.mood.map((option) => option.id).join(", ")}`
        )
        .option("--mask <path>", "Mask image: white marks what to relight"),
    promptFirst: (mode) => mode === undefined,
    promptFlag: { key: "mood", usage: "--mood <id>" },
    sourceKind: "image",
    task: "relight",
    usage: "[image] [light]",
    verb: "Relighting",
  },
  {
    command: "restore",
    modes: [
      { description: "Colourise a black-and-white photograph", mode: "colour" },
      { description: "Brighten a dark or underexposed photo", mode: "dark" },
      { description: "Remove noise", mode: "noise" },
      { description: "Repair scratches, tears and damage", mode: "scratches" },
      { description: "Sharpen a soft or blurred image", mode: "softness" },
      { description: "Fix exposure, white balance and colour", mode: "tone" },
    ],
    promptFirst: never,
    sourceKind: "image",
    task: "restore",
    usage: "[image]",
    verb: "Restoring",
  },
  {
    command: "restyle",
    input: likeInput,
    modes: [],
    options: (command) =>
      command.option(
        "--like <image>",
        "Style reference image to redraw it like"
      ),
    promptFirst: never,
    sourceKind: "image",
    task: "restyle",
    usage: "[image]",
    verb: "Restyling",
  },
  {
    command: "segment",
    modes: [
      { description: "Segment every region without a prompt", mode: "auto" },
      { description: "Return run-length encoded masks", mode: "rle" },
    ],
    promptFirst: (mode) => mode === undefined || mode === "rle",
    sourceKind: "image-or-video",
    task: "segment",
    usage: "[what] [image-or-video]",
    verb: "Segmenting",
    writesFiles: (mode) => mode !== "rle",
  },
  {
    command: "tile",
    modes: [
      {
        description: "Upscale a tiling texture and keep it seamless",
        mode: "upscale",
      },
    ],
    promptFirst: (mode) => mode === undefined,
    sourceKind: "image",
    sourceOptional: (mode) => mode === undefined,
    task: "tile",
    usage: "[prompt] [image]",
    verb: "Tiling",
  },
  {
    command: "upscale",
    input: (options, format) => {
      const scale = stringOption(options, "scale");
      return {
        ...(scale !== undefined && {
          scale: parsed(format, () =>
            parseNumberOption(scale, "scale", { min: 1 })
          ),
        }),
        ...(options.transparent === true && { transparent: true }),
      };
    },
    modes: [
      { description: "Reimagine detail as it enlarges", mode: "creative" },
      {
        description: "Synthesise plausible detail as it enlarges",
        mode: "generative",
      },
    ],
    options: (command) =>
      command
        .option("--scale <n>", "Upscale factor")
        .option("--transparent", "Keep the alpha channel"),
    promptFirst: never,
    sourceKind: "image-or-video",
    task: "upscale",
    usage: "[image-or-video]",
    verb: "Upscaling",
  },
  {
    command: "vectorize",
    extension: ".svg",
    modes: [],
    promptFirst: never,
    sourceKind: "image",
    task: "vectorize",
    usage: "[image]",
    verb: "Vectorizing",
  },
];
