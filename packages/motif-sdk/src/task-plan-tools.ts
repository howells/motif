/**
 * Request bodies for fal tool Models: map each TaskInput field onto the key
 * the tool's generated parameter list names, refuse what it doesn't list, and
 * refuse a request missing a parameter fal requires.
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { exactImageSize } from "./aspects";
import type { MotifError } from "./errors";
import { dataUrlImageSize } from "./source-size";
import type { TaskInput } from "./task-client";
import {
  cannotCarry,
  invalidOption,
  isPresent,
  mergeParams,
  refuseOthers,
} from "./task-plan-shared";
import type { CarriedField, PlanBody } from "./task-plan-shared";
import { TASKS } from "./tasks";
import type { RankedModel, TaskId } from "./tasks";
import { projectedToolCost } from "./tool-cost";
import { FAL_TOOL_PARAMETERS } from "./tool-parameters.generated";
import type { FalToolParameter } from "./tool-parameters.generated";
import { buildFalToolRequest, FAL_TOOLS } from "./tools";
import type { FalToolId } from "./tools";
import type { AspectRatio, CustomImageSize } from "./types";

type Box = NonNullable<TaskInput["boxes"]>[number];

/** Tools whose `box_prompts` take fractions of the image, 0-1, one box only. */
const FRACTION_BOX_TOOLS: ReadonlySet<string> = new Set([
  "object-removal-bbox",
]);

/** The TaskInput field that supplies each fal key a tool may require. */
const FIELD_FOR_KEY: Readonly<Record<string, CarriedField>> = {
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

function rankedEntry(
  task: TaskId,
  model: string,
  mode: string | undefined
): RankedModel | undefined {
  const entries: readonly RankedModel[] = TASKS[task].models;
  return entries.find((entry) => entry.model === model && entry.mode === mode);
}

function maskKey(
  task: TaskId,
  model: FalToolId,
  mode: string | undefined
): string | undefined {
  if (model === "iclight-v2") {
    return "mask_image_url";
  }
  const requiresMask =
    rankedEntry(task, model, mode)?.requires?.includes("mask") === true;
  return task === "erase" && requiresMask ? "mask_url" : undefined;
}

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

/** The source's pixel size: read from a data URL, else the caller's `sourceSize`. */
function sourceSizeOf(input: TaskInput): CustomImageSize | undefined {
  const fromData =
    input.image === undefined ? undefined : dataUrlImageSize(input.image);
  return fromData ?? input.sourceSize;
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
  if (!FRACTION_BOX_TOOLS.has(model)) {
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
    [
      "sizes",
      "target_sizes",
      input.sizes?.map(({ height, width }) => `${width}x${height}`),
    ],
  ];
  for (const [field, key, value] of direct) {
    if (!isPresent(input, field)) {
      continue;
    }
    if (!parameters.has(key)) {
      return err(cannotCarry(field, model, task));
    }
    options[key] = value;
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
    const key = maskKey(task, model, input.mode);
    if (key === undefined) {
      return err(cannotCarry("mask", model, task));
    }
    options[key] = input.mask;
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
    "negativePrompt",
    "outputFormat",
    "prompt",
    "resolution",
    "scale",
    "seed",
    "sizes",
  ]);
  if (model === "topaz-transparent") {
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
  if (media === undefined) {
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
  const { body, endpoint } = buildFalToolRequest({
    input: media,
    options: merged.value,
    tool: model,
  });
  const missing = missingRequired(task, model, body);
  if (missing !== undefined) {
    return err(missing);
  }
  return ok({
    body,
    cost: projectedToolCost(tool.price),
    endpoint,
    prompt: input.prompt,
    provider: "fal",
    queued: "queued" in tool,
  });
}
