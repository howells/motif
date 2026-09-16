/**
 * One verb per Task. Each definition says which positionals the verb reads,
 * which mode flags it offers, and which extra flags become TaskInput fields;
 * `registerTaskVerb` turns a definition into a commander command over the
 * `runTask` kernel.
 */

import { existsSync } from "node:fs";

import { ASPECT_RATIOS, FORMAT_PRESETS, TASKS } from "@howells/motif-sdk";
import type {
  AspectRatio,
  Resolution,
  TaskId,
  TaskInput,
  TaskOutput,
} from "@howells/motif-sdk";
import type { Command } from "commander";

import type { MotifConfig } from "../../utils/config";
import { handleError } from "../../utils/errors";
import {
  parseIntegerOption,
  parseNumberOption,
  validateEnumOption,
} from "../../utils/input";
import { imageSource } from "../../utils/motif-client";
import type { OutputFormat } from "../../utils/output";
import { hasText } from "../../utils/text";
import { runTask } from "../task-run";
import { parseBoxes, parseMargin, parseSizes } from "./pixel-options";
import {
  commonInput,
  exclusiveFlag,
  verbEmitOptions,
  withCommonOptions,
} from "./shared";
import type { VerbOptions } from "./shared";

/** A mode flag: `--text`, or a value flag such as `--detect <thing>`. */
interface ModeFlag {
  /** The Task mode id, also the flag name. */
  mode: string;
  description: string;
  /** Placeholder for a value flag, e.g. `thing`. */
  value?: string;
  /** Whether a value flag's value is the prompt. */
  valueIsPrompt?: boolean;
}

interface VerbDefinition {
  command: string;
  task: TaskId;
  /** Positional placeholders after the verb, as `--help` prints them. */
  usage: string;
  /** Whether the first positional is the prompt, for the chosen mode. */
  promptFirst: (mode: string | undefined, options: VerbOptions) => boolean;
  sourceKind: "image" | "image-or-video";
  /**
   * Whether the Task runs from a prompt alone in this mode, so a missing
   * source isn't filled from the last generation.
   */
  sourceOptional?: (mode: string | undefined) => boolean;
  modes: readonly ModeFlag[];
  /** Present participle for the spinner. */
  verb: string;
  extension?: string;
  writesFiles?: (mode?: string) => boolean;
  quiet?: boolean;
  /** Extra flags beyond the common set and the modes. */
  options?: (command: Command) => Command;
  /** TaskInput fields the extra flags set. */
  input?: (
    options: VerbOptions,
    format: OutputFormat,
    mode: string | undefined
  ) => Promise<TaskInput> | TaskInput;
  data?: (output: TaskOutput) => Record<string, unknown>;
  render?: (output: TaskOutput) => string | undefined;
}

const SOURCE_PATH_REGEX =
  /\.(png|jpe?g|webp|gif|avif|tiff?|mp4|mov|m4v|webm)$/i;

const never = (): boolean => false;
const always = (): boolean => true;

function stringOption(options: VerbOptions, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function invalid(message: string, format: OutputFormat): never {
  handleError(new Error(message), "INVALID_OPTION", format);
}

function parsed<T>(format: OutputFormat, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    handleError(error, "INVALID_OPTION", format);
  }
}

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
    input: maskInput,
    modes: [
      { description: "Restore natural, even lighting", mode: "even" },
      { description: "Strip baked-in light and shadow", mode: "flat" },
    ],
    options: (command) =>
      command.option(
        "--mask <path>",
        "Mask image: white marks what to relight"
      ),
    promptFirst: (mode) => mode === undefined,
    sourceKind: "image",
    task: "relight",
    usage: "[light] [image]",
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

/** `motif <command> <usage>`, as errors quote it. */
export function usageLine(definition: VerbDefinition): string {
  return `motif ${definition.command} ${definition.usage}`;
}

/** Split positionals into the prompt and the source, per the chosen mode. */
function positionals(
  definition: VerbDefinition,
  args: readonly (string | undefined)[],
  mode: string | undefined,
  options: VerbOptions,
  format: OutputFormat
): { prompt?: string; source?: string } {
  const [first, second] = args;
  const modeFlag = definition.modes.find((flag) => flag.mode === mode);
  const flagPrompt =
    modeFlag?.valueIsPrompt === true
      ? stringOption(options, modeFlag.mode)
      : undefined;
  // `motif tile photo.png`: a lone argument naming an existing image is the
  // source, not the prompt, when the Task can run without a prompt.
  if (
    definition.sourceOptional?.(mode) === true &&
    hasText(first) &&
    !hasText(second) &&
    SOURCE_PATH_REGEX.test(first) &&
    existsSync(first)
  ) {
    return { source: first };
  }
  if (definition.promptFirst(mode, options)) {
    if (!hasText(first)) {
      invalid(
        `motif ${definition.command} needs a prompt: ${usageLine(definition)}`,
        format
      );
    }
    return { prompt: first, source: second };
  }
  if (hasText(second)) {
    invalid(
      `motif ${definition.command}${mode === undefined ? "" : ` --${mode}`} takes only a source path; got ${JSON.stringify(first)} and ${JSON.stringify(second)}. Usage: ${usageLine(definition)}`,
      format
    );
  }
  return { prompt: flagPrompt, source: first };
}

export function registerTaskVerb(
  program: Command,
  definition: VerbDefinition,
  config: MotifConfig
): void {
  const takesTwo = definition.usage.split(" ").length > 1;
  let command = program
    .command(definition.command)
    .description(TASKS[definition.task].summary)
    .argument("[first]")
    .usage(`${definition.usage} [options]`);
  if (takesTwo) {
    command = command.argument("[second]");
  }
  for (const flag of definition.modes) {
    command = command.option(
      flag.value === undefined
        ? `--${flag.mode}`
        : `--${flag.mode} <${flag.value}>`,
      flag.description
    );
  }
  command = definition.options?.(command) ?? command;
  withCommonOptions(command).action(async (...received: unknown[]) => {
    const args = received
      .slice(0, takesTwo ? 2 : 1)
      .map((value) => (typeof value === "string" ? value : undefined));
    const options = command.opts<VerbOptions>();
    const emitOpts = verbEmitOptions(options);
    const { format } = emitOpts;
    const common = commonInput(options, format);
    const mode = exclusiveFlag(
      options,
      definition.modes.map((flag) => flag.mode),
      definition.command,
      format
    );
    const { prompt, source } = positionals(
      definition,
      args,
      mode,
      options,
      format
    );
    const extra = (await definition.input?.(options, format, mode)) ?? {};

    await runTask(
      {
        command: definition.command,
        ...(definition.data !== undefined && { data: definition.data }),
        ...(definition.extension !== undefined && {
          extension: definition.extension,
        }),
        input: {
          ...common,
          ...extra,
          ...(mode !== undefined && { mode }),
          ...(hasText(prompt) && { prompt }),
        },
        outputSuffix:
          mode === undefined
            ? `-${definition.command}`
            : `-${definition.command}-${mode}`,
        ...(definition.quiet === true && { quiet: true }),
        ...(definition.render !== undefined && { render: definition.render }),
        sourceKind: definition.sourceKind,
        ...(definition.sourceOptional?.(mode) === true && {
          sourceOptional: true,
        }),
        task: definition.task,
        verb: definition.verb,
        writesFiles: definition.writesFiles?.(mode) ?? true,
      },
      {
        dryRun: options.dryRun === true,
        noOpen: options.open === false,
        output: options.output,
        source,
      },
      config,
      emitOpts
    );
  });
}
