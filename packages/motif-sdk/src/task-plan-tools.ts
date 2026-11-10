/**
 * Request bodies for fal tool Models: map each TaskInput field onto the key
 * the tool's generated parameter list names, refuse what it doesn't list, and
 * refuse a request missing a parameter fal requires.
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { exactImageSize, FAL_PRESET_SIZES } from "./aspects";
import { enrichPrompt } from "./creative";
import type { MotifError } from "./errors";
import type { TaskInput } from "./task-client";
import {
  cannotCarry,
  invalidOption,
  isCustomSize,
  isPresent,
  mergeParams,
  refuseOthers,
  sourceSizeOf,
} from "./task-plan-shared";
import type { CarriedField, PlanBody } from "./task-plan-shared";
import { TASKS } from "./tasks";
import type { TaskDefinition, TaskId } from "./tasks";
import { projectedToolCost } from "./tool-cost";
import type { OutputDimensions, SourceFacts } from "./tool-cost";
import { FAL_TOOL_PARAMETERS } from "./tool-parameters.generated";
import type { FalToolParameter } from "./tool-parameters.generated";
import type { FalToolConfig } from "./tool-types";
import { buildFalToolRequest, FAL_TOOLS } from "./tools";
import type { FalToolId } from "./tools";
import type { AspectRatio, CustomImageSize } from "./types";

type Box = NonNullable<TaskInput["boxes"]>[number];

/** The TaskInput field that supplies each fal key a tool may require. */
export const FIELD_FOR_KEY: Readonly<Record<string, CarriedField>> = {
  aspect_ratio: "aspect",
  box_prompts: "boxes",
  canvas_size: "aspect",
  image_size: "aspect",
  negative_prompt: "negativePrompt",
  num_images: "count",
  output_format: "outputFormat",
  prompt: "prompt",
  seed: "seed",
  target_sizes: "sizes",
  upscale_factor: "scale",
};

const ENUM_TYPE_REGEX = /^enum\((.*)\)$/;

function enumValues(parameter: FalToolParameter | undefined): string[] {
  const match = ENUM_TYPE_REGEX.exec(parameter?.type ?? "");
  return match?.[1] === undefined ? [] : match[1].split("|");
}

function isWholePixelBox({ height, width, x, y }: Box): boolean {
  return (
    [x, y, width, height].every(Number.isInteger) &&
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0
  );
}

/** A body value, else the endpoint's own default for that key. */
function valueOrFallback(
  parameters: readonly FalToolParameter[],
  body: Readonly<Record<string, unknown>>,
  key: string
): unknown {
  return (
    body[key] ?? parameters.find((parameter) => parameter.key === key)?.fallback
  );
}

/**
 * How many times a tool multiplies the source's width and height, when that is
 * known before the run. Undefined for a tool sized by a target resolution.
 */
function outputScale(
  model: FalToolId,
  parameters: readonly FalToolParameter[],
  body: Readonly<Record<string, unknown>>
): number | undefined {
  const { fixedScale }: FalToolConfig = FAL_TOOLS[model];
  if (fixedScale !== undefined) {
    return fixedScale;
  }
  const mode = valueOrFallback(parameters, body, "upscale_mode");
  if (mode !== undefined && mode !== "factor") {
    return undefined;
  }
  if (!parameters.some((parameter) => parameter.key === "upscale_factor")) {
    const sizedByTarget = parameters.some(
      (parameter) => parameter.key === "target_resolution"
    );
    return sizedByTarget ? undefined : 1;
  }
  const factor = Number(valueOrFallback(parameters, body, "upscale_factor"));
  // Patina Extract takes 0 for no upscale.
  return Number.isFinite(factor) && factor >= 1 ? factor : 1;
}

/** Outputs a run returns: one per `maps` entry for a PBR tool, else `num_images`. */
function outputCount(
  model: FalToolId,
  parameters: readonly FalToolParameter[],
  body: Readonly<Record<string, unknown>>
): number {
  const images = typeof body.num_images === "number" ? body.num_images : 1;
  const { price }: FalToolConfig = FAL_TOOLS[model];
  if (price.kind !== "maps") {
    return images;
  }
  const maps = valueOrFallback(parameters, body, "maps");
  return images * (Array.isArray(maps) ? maps.length : 1);
}

/**
 * The size of each output a per-megapixel tool will bill, when it is known
 * before the run: the body's `image_size`, the source's size for a tool that
 * returns images at their source size, scaled by a known upscale factor, and
 * grown by any outpainting margin. Empty when it can't be known.
 */
function projectedOutputs(
  model: FalToolId,
  input: TaskInput,
  body: Readonly<Record<string, unknown>>
): OutputDimensions[] {
  const parameters = FAL_TOOL_PARAMETERS[model] ?? [];
  const scale = outputScale(model, parameters, body);
  const size = outputSize(parameters, input, body.image_size);
  if (scale === undefined || size === undefined) {
    return [];
  }
  const margin = (key: string): number =>
    typeof body[key] === "number" ? body[key] : 0;
  const output = {
    height:
      (size.height + margin("expand_top") + margin("expand_bottom")) * scale,
    width:
      (size.width + margin("expand_left") + margin("expand_right")) * scale,
  };
  return Array.from(
    { length: outputCount(model, parameters, body) },
    () => output
  );
}

function outputSize(
  parameters: readonly FalToolParameter[],
  input: TaskInput,
  imageSize: unknown
): CustomImageSize | undefined {
  if (typeof imageSize === "string") {
    return FAL_PRESET_SIZES[imageSize];
  }
  if (isCustomSize(imageSize)) {
    return imageSize;
  }
  if (imageSize === undefined) {
    const fallback = parameters.find(
      (parameter) => parameter.key === "image_size"
    )?.fallback;
    // A tool whose image_size falls back to a preset returns the preset's size.
    if (fallback === undefined) {
      return sourceSizeOf(input);
    }
    return typeof fallback === "string"
      ? FAL_PRESET_SIZES[fallback]
      : undefined;
  }
  return undefined;
}

/** What the plan knows of the source, for prices that read it. */
function sourceFacts(input: TaskInput): SourceFacts {
  const image = sourceSizeOf(input);
  return {
    ...(image !== undefined && { image }),
    ...(input.sourceVideo !== undefined && { video: input.sourceVideo }),
  };
}

/**
 * `box_prompts` in the tool's own unit. `boxes` are always whole pixels of the
 * source; a tool that takes fractions gets them divided by the source size.
 */
function boxPrompts(
  task: TaskId,
  model: FalToolId,
  input: TaskInput,
  boxes: readonly Box[]
): Result<Record<string, number>[], MotifError> {
  if (!boxes.every(isWholePixelBox)) {
    return err(
      invalidOption("boxes are whole pixels of the source image.", {
        field: "boxes",
        model,
        task,
      })
    );
  }
  const corners = boxes.map(({ height, width, x, y }) => ({
    x_max: x + width,
    x_min: x,
    y_max: y + height,
    y_min: y,
  }));
  const { fractionBoxes }: FalToolConfig = FAL_TOOLS[model];
  if (fractionBoxes !== true) {
    return ok(corners);
  }
  if (boxes.length !== 1) {
    return err(
      invalidOption(`${model} takes exactly one box.`, {
        field: "boxes",
        model,
        task,
      })
    );
  }
  const size = sourceSizeOf(input);
  if (size === undefined) {
    return err(
      invalidOption(
        `${model} needs the source image's size to place a box: pass a data URL or sourceSize.`,
        { field: "sourceSize", model, task }
      )
    );
  }
  const outside = corners.some(
    (box) => box.x_max > size.width || box.y_max > size.height
  );
  if (outside) {
    return err(
      invalidOption("A box reaches outside the source image.", {
        field: "boxes",
        model,
        task,
      })
    );
  }
  return ok(
    corners.map((box) => ({
      x_max: box.x_max / size.width,
      x_min: box.x_min / size.width,
      y_max: box.y_max / size.height,
      y_min: box.y_min / size.height,
    }))
  );
}

interface MappedOptions {
  options: Record<string, unknown>;
}

function aspectOptions(
  task: TaskId,
  model: FalToolId,
  input: TaskInput,
  parameters: ReadonlyMap<string, FalToolParameter>,
  aspect: AspectRatio
): Result<Record<string, unknown>, MotifError> {
  const options: Record<string, unknown> = {};
  const resolution = input.resolution ?? "1K";
  const ratioParameter = parameters.get("aspect_ratio");
  if (ratioParameter !== undefined) {
    const accepted = enumValues(ratioParameter);
    if (accepted.length > 0 && !accepted.includes(aspect)) {
      return err(
        invalidOption(`${model} cannot take aspect ${aspect} for ${task}.`, {
          accepts: accepted,
          field: "aspect",
          model,
          task,
        })
      );
    }
    options.aspect_ratio = aspect;
  }
  const size = exactImageSize(aspect, resolution);
  if (parameters.has("canvas_size")) {
    // Bria's final canvas: the ratio at the resolution tier, 1K by default.
    if (size === null) {
      return err(cannotCarry("aspect", model, task));
    }
    options.canvas_size = [size.width, size.height];
  }
  if (ratioParameter === undefined && !parameters.has("canvas_size")) {
    if (size === null || !parameters.has("image_size")) {
      return err(cannotCarry("aspect", model, task));
    }
    options.image_size = size;
  }
  return ok(options);
}

/** A Mood names a light, so relight joins its clause after the prompt. */
function moodPrompt(input: TaskInput): string {
  return enrichPrompt({
    creative: { mood: input.mood },
    prompt: input.prompt ?? "",
  }).prompt;
}

/** The fal body keys for each TaskInput field a tool can take. */
function toolOptions(
  task: TaskId,
  model: FalToolId,
  input: TaskInput
): Result<MappedOptions, MotifError> {
  const parameters = new Map(
    (FAL_TOOL_PARAMETERS[model] ?? []).map((parameter) => [
      parameter.key,
      parameter,
    ])
  );
  const mediaField = FAL_TOOLS[model].inputKind === "video" ? "video" : "image";
  const options: Record<string, unknown> = {};

  const direct: [CarriedField, string, unknown][] = [
    ["prompt", "prompt", input.prompt],
    ["negativePrompt", "negative_prompt", input.negativePrompt],
    ["seed", "seed", input.seed],
    ["count", "num_images", input.count],
    ["outputFormat", "output_format", input.outputFormat],
    ["scale", "upscale_factor", input.scale],
    // Only a rig asked for is carried; rig: false is every Model's default.
    ["rig", "enable_rigging", input.rig === true ? true : undefined],
    [
      "sizes",
      "target_sizes",
      input.sizes?.map(({ height, width }) => `${width}x${height}`),
    ],
  ];
  for (const [field, key, value] of direct) {
    if (value === undefined || !isPresent(input, field)) {
      continue;
    }
    if (!parameters.has(key)) {
      return err(cannotCarry(field, model, task));
    }
    options[key] = value;
  }

  if (isPresent(input, "mood")) {
    const definition: TaskDefinition = TASKS[task];
    if (definition.takesMood !== true || !parameters.has("prompt")) {
      return err(cannotCarry("mood", model, task));
    }
    options.prompt = moodPrompt(input);
  }

  const { keepsAlpha, maskField, referenceField }: FalToolConfig =
    FAL_TOOLS[model];
  if (referenceField !== undefined && isPresent(input, "references")) {
    options[referenceField] = input.references?.[0];
  }

  if (input.aspect !== undefined) {
    const sized = aspectOptions(task, model, input, parameters, input.aspect);
    if (sized.isErr()) {
      return err(sized.error);
    }
    Object.assign(options, sized.value);
  }
  const sizedByResolution =
    options.image_size !== undefined || options.canvas_size !== undefined;
  if (input.resolution !== undefined && !sizedByResolution) {
    return err(cannotCarry("resolution", model, task));
  }

  if (input.mask !== undefined) {
    if (maskField === undefined) {
      return err(cannotCarry("mask", model, task));
    }
    options[maskField] = input.mask;
  }

  if (isPresent(input, "boxes")) {
    if (!parameters.has("box_prompts")) {
      return err(cannotCarry("boxes", model, task));
    }
    const prompts = boxPrompts(task, model, input, input.boxes ?? []);
    if (prompts.isErr()) {
      return err(prompts.error);
    }
    options.box_prompts = prompts.value;
  }

  if (input.margin !== undefined) {
    const edges = ["top", "right", "bottom", "left"] as const;
    if (edges.some((edge) => !parameters.has(`expand_${edge}`))) {
      return err(cannotCarry("margin", model, task));
    }
    for (const edge of edges) {
      const value = input.margin[edge];
      if (!Number.isInteger(value) || value < 0) {
        return err(
          invalidOption(`margin.${edge} must be a whole number of pixels.`, {
            field: "margin",
            model,
            task,
          })
        );
      }
      options[`expand_${edge}`] = value;
    }
  }

  const handled = new Set<CarriedField>([
    mediaField,
    "aspect",
    "boxes",
    "count",
    "margin",
    "mask",
    "mood",
    "negativePrompt",
    "outputFormat",
    "prompt",
    "resolution",
    "rig",
    "scale",
    "seed",
    "sizes",
  ]);
  if (referenceField !== undefined) {
    handled.add("references");
  }
  if (keepsAlpha === true) {
    handled.add("transparent");
  }
  const refused = refuseOthers(input, handled, model, task);
  return refused === undefined ? ok({ options }) : err(refused);
}

/** Refuse a request missing a parameter fal requires. */
function missingRequired(
  task: TaskId,
  model: FalToolId,
  body: Record<string, unknown>
): MotifError | undefined {
  const missing = (FAL_TOOL_PARAMETERS[model] ?? []).find(
    (parameter) =>
      parameter.required === true && body[parameter.key] === undefined
  );
  if (missing === undefined) {
    return undefined;
  }
  const field = FIELD_FOR_KEY[missing.key] ?? missing.key;
  return invalidOption(`${model} needs ${field} for ${task}.`, {
    field,
    model,
    task,
  });
}

export function toolPlan(
  task: TaskId,
  model: FalToolId,
  input: TaskInput
): Result<PlanBody, MotifError> {
  const tool = FAL_TOOLS[model];
  const media = tool.inputKind === "video" ? input.video : input.image;
  const sourceless = input.image === undefined && input.video === undefined;
  if (media === undefined && !sourceless) {
    // The source passed is the other kind: an image to a video Model, or back.
    const passed = tool.inputKind === "video" ? "image" : "video";
    return err(cannotCarry(passed, model, task));
  }
  const mapped = toolOptions(task, model, input);
  if (mapped.isErr()) {
    return err(mapped.error);
  }
  const { options } = mapped.value;
  const merged = mergeParams(
    options,
    input.params,
    new Set([...Object.keys(options), tool.inputField])
  );
  if (merged.isErr()) {
    return err(merged.error);
  }
  const { defaultOptions }: FalToolConfig = tool;
  // planTask has already refused a missing Source the Model needs.
  const { body, endpoint } =
    media === undefined
      ? {
          body: { ...defaultOptions, ...merged.value },
          endpoint: tool.endpoint,
        }
      : buildFalToolRequest({
          input: media,
          options: merged.value,
          tool: model,
        });
  const missing = missingRequired(task, model, body);
  if (missing !== undefined) {
    return err(missing);
  }
  const { requiredPrompt }: FalToolConfig = tool;
  if (
    requiredPrompt !== undefined &&
    (typeof body.prompt !== "string" || body.prompt === "")
  ) {
    return err(
      invalidOption(`${model} needs ${requiredPrompt} for ${task}.`, {
        field: "prompt",
        model,
        task,
      })
    );
  }
  return ok({
    body,
    cost: projectedToolCost(
      tool.price,
      body,
      projectedOutputs(model, input, body),
      sourceFacts(input)
    ),
    endpoint,
    prompt: typeof body.prompt === "string" ? body.prompt : input.prompt,
    provider: "fal",
    queued: "queued" in tool,
  });
}
