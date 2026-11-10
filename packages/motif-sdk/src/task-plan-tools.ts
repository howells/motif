/**
 * Request bodies for fal tool Models: map each TaskInput field onto the key
 * the tool's generated parameter list names, refuse what it doesn't list, and
 * refuse a request missing a parameter fal requires.
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { exactImageSize } from "./aspects";
import { DEFAULT_OUTPUT_FORMAT, OPAQUE_OUTPUT_FORMATS } from "./capabilities";
import { enrichPrompt } from "./creative";
import type { MotifError } from "./errors";
import type { TaskInput } from "./task-client";
import { boxPrompts } from "./task-plan-boxes";
import { toolParamsRefusal } from "./task-plan-params";
import { projectedOutputs, sourceFacts } from "./task-plan-projection";
import {
  cannotCarry,
  invalidOption,
  isPresent,
  mergeParams,
  refuseOthers,
  scaleRefusal,
} from "./task-plan-shared";
import type { CarriedField, PlanBody } from "./task-plan-shared";
import { TASKS } from "./tasks";
import type { TaskDefinition, TaskId } from "./tasks";
import { projectedToolCost } from "./tool-cost";
import { FAL_TOOL_PARAMETERS } from "./tool-parameters.generated";
import type { FalToolParameter } from "./tool-parameters.generated";
import type { FalToolConfig } from "./tool-types";
import { buildFalToolRequest, FAL_TOOLS } from "./tools";
import type { FalToolId } from "./tools";
import type { AspectRatio, ImageOutputFormat } from "./types";

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

/**
 * A Motif format in the spelling a tool's `output_format` takes, or undefined
 * when its enum lacks it. Motif says `jpeg`; an endpoint whose enum says `jpg`
 * gets that. An endpoint whose record gives no enum takes the format as given.
 */
function spellFormat(
  parameter: FalToolParameter | undefined,
  format: ImageOutputFormat
): string | undefined {
  const accepted = enumValues(parameter);
  if (accepted.length === 0) {
    return format;
  }
  return [format, ...(format === "jpeg" ? ["jpg"] : [])].find((value) =>
    accepted.includes(value)
  );
}

/** What a tool's `output_format` takes for a Motif format, or the refusal. */
function outputFormatOption(
  task: TaskId,
  model: FalToolId,
  parameter: FalToolParameter | undefined,
  format: ImageOutputFormat
): Result<string, MotifError> {
  const sent = spellFormat(parameter, format);
  if (sent !== undefined) {
    return ok(sent);
  }
  const takes = enumValues(parameter).map((value) =>
    value === "jpg" ? "jpeg" : value
  );
  return err(
    invalidOption(
      `${model} cannot return ${format} for ${task}; it takes ${takes.join(", ")}.`,
      { accepts: takes, field: "outputFormat", model, task }
    )
  );
}

/**
 * The PNG every tool with an `output_format` returns when none is asked for,
 * in the spelling its enum takes. A tool with no such parameter, or whose enum
 * has no PNG, gets nothing. `params.output_format` replaces it.
 */
function defaultFormatOption(
  model: FalToolId,
  input: TaskInput
): Record<string, string> {
  const parameter = (FAL_TOOL_PARAMETERS[model] ?? []).find(
    ({ key }) => key === "output_format"
  );
  if (parameter === undefined || input.outputFormat !== undefined) {
    return {};
  }
  const sent = spellFormat(parameter, DEFAULT_OUTPUT_FORMAT);
  return sent === undefined ? {} : { output_format: sent };
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

/**
 * Whether an endpoint's `image_size` is a source-sized enum (`auto`,
 * `auto_1K`...) with no `{ width, height }` form, by its record's type.
 */
function sizesFromSource(parameter: FalToolParameter | undefined): boolean {
  return (
    parameter !== undefined &&
    !parameter.type.includes("object") &&
    enumValues(parameter).length > 0
  );
}

/**
 * `image_size` for an endpoint that sizes its output from the source: `auto`,
 * or `auto_<resolution>` for the resolution asked. Any other aspect is refused,
 * because the endpoint keeps the source's shape.
 */
function sourceSizeOptions(
  task: TaskId,
  model: FalToolId,
  input: TaskInput,
  parameter: FalToolParameter | undefined
): Result<Record<string, unknown>, MotifError> {
  if (input.aspect !== undefined && input.aspect !== "auto") {
    return err(
      invalidOption(
        `${model} sizes its output from the source image; it takes aspect auto, not ${input.aspect}.`,
        { accepts: ["auto"], field: "aspect", model, task }
      )
    );
  }
  const accepted = enumValues(parameter);
  const size =
    input.resolution === undefined ? "auto" : `auto_${input.resolution}`;
  if (!accepted.includes(size)) {
    const resolutions = accepted
      .filter((value) => value.startsWith("auto_"))
      .map((value) => value.slice("auto_".length));
    return err(
      invalidOption(
        `${model} cannot take resolution ${input.resolution} for ${task}; it takes ${resolutions.join(", ")}.`,
        { accepts: resolutions, field: "resolution", model, task }
      )
    );
  }
  return ok({ image_size: size });
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
  const { keepsAlpha, maskField, referenceField }: FalToolConfig =
    FAL_TOOLS[model];
  const mediaField = FAL_TOOLS[model].inputKind === "video" ? "video" : "image";
  const options: Record<string, unknown> = {};

  const direct: [CarriedField, string, unknown][] = [
    ["prompt", "prompt", input.prompt],
    ["negativePrompt", "negative_prompt", input.negativePrompt],
    ["seed", "seed", input.seed],
    ["count", "num_images", input.count],
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

  if (input.scale !== undefined) {
    const accepted = enumValues(parameters.get("upscale_factor"))
      .map(Number)
      .filter((value) => value > 0);
    const badScale = scaleRefusal(task, model, input.scale, accepted);
    if (badScale !== undefined) {
      return err(badScale);
    }
  }

  if (input.outputFormat !== undefined) {
    if (!parameters.has("output_format")) {
      return err(cannotCarry("outputFormat", model, task));
    }
    if (
      keepsAlpha === true &&
      input.transparent === true &&
      OPAQUE_OUTPUT_FORMATS.includes(input.outputFormat)
    ) {
      return err(
        invalidOption(
          `${model} keeps transparency, which ${input.outputFormat} cannot hold.`,
          { field: "outputFormat", model, task, transparent: true }
        )
      );
    }
    const format = outputFormatOption(
      task,
      model,
      parameters.get("output_format"),
      input.outputFormat
    );
    if (format.isErr()) {
      return err(format.error);
    }
    options.output_format = format.value;
  }

  if (isPresent(input, "mood")) {
    const definition: TaskDefinition = TASKS[task];
    if (definition.takesMood !== true || !parameters.has("prompt")) {
      return err(cannotCarry("mood", model, task));
    }
    options.prompt = moodPrompt(input);
  }

  if (referenceField !== undefined && isPresent(input, "references")) {
    options[referenceField] = input.references?.[0];
  }

  if (sizesFromSource(parameters.get("image_size"))) {
    if (input.aspect !== undefined || input.resolution !== undefined) {
      const sized = sourceSizeOptions(
        task,
        model,
        input,
        parameters.get("image_size")
      );
      if (sized.isErr()) {
        return err(sized.error);
      }
      Object.assign(options, sized.value);
    }
  } else {
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
  const defaulted = {
    ...defaultFormatOption(model, input),
    ...merged.value,
  };
  // planTask has already refused a missing Source the Model needs.
  const badParam =
    input.params === undefined
      ? undefined
      : toolParamsRefusal(
          task,
          model,
          FAL_TOOL_PARAMETERS[model] ?? [],
          input.params
        );
  if (badParam !== undefined) {
    return err(badParam);
  }
  const { body, endpoint } =
    media === undefined
      ? {
          body: { ...defaultOptions, ...defaulted },
          endpoint: tool.endpoint,
        }
      : buildFalToolRequest({
          input: media,
          options: defaulted,
          tool: model,
        });
  const missing = missingRequired(task, model, body);
  if (missing !== undefined) {
    return err(missing);
  }
  const { needsTarget, requiredPrompt }: FalToolConfig = tool;
  const pointed = ["box_prompts", "point_prompts"].some(
    (key) => Array.isArray(body[key]) && body[key].length > 0
  );
  if (
    needsTarget === true &&
    (typeof body.prompt !== "string" || body.prompt === "") &&
    !pointed
  ) {
    return err(
      invalidOption(
        `${model} needs a prompt naming what to segment, or boxes, for ${task}.`,
        { field: "prompt", model, task }
      )
    );
  }
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
