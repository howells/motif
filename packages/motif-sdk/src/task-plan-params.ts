/**
 * Validation of `params`, the Model-only body fields a caller sends as given.
 * A tool Model's params are checked against its generated parameter record:
 * the key must exist, and the value must match its enum or basic type. A
 * generation Model has no record, so a param is checked only where Motif
 * already limits the same field for the Task option.
 */

import { withinImageSizeBounds } from "./aspects";
import { outputFormatsOf } from "./capabilities";
import type { MotifError } from "./errors";
import { FAL_IMAGE_SIZE_PRESETS, GPT_IMAGE_SIZES } from "./generate";
import type { TaskInput } from "./task-client";
import { invalidOption, isCustomSize } from "./task-plan-shared";
import type { TaskId } from "./tasks";
import type { FalToolParameter } from "./tool-parameters.generated";
import type { ModelConfig } from "./types";

type Params = NonNullable<TaskInput["params"]>;

const ENUM_REGEX = /^enum\((.*)\)$/;

function isObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** What `type` wants in words when `value` is not it, else undefined. */
function scalarProblem(type: string, value: unknown): string | undefined {
  const enumMatch = ENUM_REGEX.exec(type);
  if (enumMatch?.[1] !== undefined) {
    const accepted = enumMatch[1].split("|");
    const known =
      (typeof value === "string" || typeof value === "number") &&
      accepted.includes(String(value));
    return known ? undefined : `one of ${accepted.join(", ")}`;
  }
  const checks: Record<string, [(value: unknown) => boolean, string]> = {
    boolean: [(v) => typeof v === "boolean", "true or false"],
    integer: [Number.isInteger, "a whole number"],
    number: [(v) => typeof v === "number" && Number.isFinite(v), "a number"],
    object: [isObject, "an object"],
    string: [(v) => typeof v === "string", "a string"],
  };
  const check = checks[type];
  return check === undefined || check[0](value) ? undefined : check[1];
}

/** What a record type wants in words when `value` is not it, else undefined. */
function typeProblem(type: string, value: unknown): string | undefined {
  if (type.startsWith("list[")) {
    const inner = type.slice("list[".length, -1);
    if (!Array.isArray(value)) {
      return `a list of ${inner}`;
    }
    return value.some((item) => scalarProblem(inner, item) !== undefined)
      ? `a list of ${inner}`
      : undefined;
  }
  if (type.startsWith("object|")) {
    return isObject(value) ||
      scalarProblem(type.slice("object|".length), value) === undefined
      ? undefined
      : `an object, or ${scalarProblem(type.slice("object|".length), value)}`;
  }
  return scalarProblem(type, value);
}

/** The first param a tool's record does not list, or whose value does not fit it. */
export function toolParamsRefusal(
  task: TaskId,
  model: string,
  parameters: readonly FalToolParameter[],
  params: Params
): MotifError | undefined {
  const keys = parameters.map((parameter) => parameter.key);
  for (const [key, value] of Object.entries(params)) {
    const parameter = parameters.find((candidate) => candidate.key === key);
    if (parameter === undefined) {
      return invalidOption(
        `params.${key} is not a parameter of ${model}. ${keys.length === 0 ? "It takes no params" : `It takes: ${keys.join(", ")}`}.`,
        { accepts: keys, field: "params", key, model, task }
      );
    }
    const wanted = typeProblem(parameter.type, value);
    if (wanted !== undefined) {
      return invalidOption(
        `params.${key} for ${model} must be ${wanted}, not ${JSON.stringify(value)}.`,
        { field: "params", key, model, task }
      );
    }
  }
  return undefined;
}

function refusal(
  task: TaskId,
  model: string,
  key: string,
  message: string,
  accepts?: readonly unknown[]
): MotifError {
  return invalidOption(message, {
    ...(accepts !== undefined && { accepts }),
    field: "params",
    key,
    model,
    task,
  });
}

/**
 * The first param that would get past a limit Motif enforces on the Task
 * option for the same field: ratio, resolution, output format, seed,
 * negative prompt and image size.
 */
export function generationParamsRefusal(
  task: TaskId,
  model: string,
  config: ModelConfig,
  params: Params,
  editing: boolean
): MotifError | undefined {
  const { aspect_ratio: aspect, image_size: size } = params;
  const unsupported = (key: string, what: string): MotifError =>
    refusal(task, model, key, `${model} does not take ${what}.`);
  const listed = (
    key: string,
    value: unknown,
    allowed: readonly unknown[] | undefined
  ): MotifError | undefined =>
    allowed === undefined || allowed.includes(value)
      ? undefined
      : refusal(
          task,
          model,
          key,
          `${model} takes ${key} ${allowed.join(", ")}, not ${JSON.stringify(value)}.`,
          allowed
        );

  if (aspect !== undefined) {
    const bad = listed("aspect_ratio", aspect, config.supportedAspects);
    if (bad !== undefined) {
      return bad;
    }
  }
  if (params.resolution !== undefined) {
    if (!config.supportsResolution) {
      return unsupported("resolution", "a resolution");
    }
    const value = params.resolution;
    const bad = listed(
      "resolution",
      config.lowercaseResolution === true && typeof value === "string"
        ? value.toUpperCase()
        : value,
      config.supportedResolutions
    );
    if (bad !== undefined) {
      return bad;
    }
  }
  if (params.output_format !== undefined) {
    if (config.supportsOutputFormat !== true) {
      return unsupported("output_format", "an output format");
    }
    const bad = listed(
      "output_format",
      params.output_format,
      outputFormatsOf(config, editing)
    );
    if (bad !== undefined) {
      return bad;
    }
  }
  if (params.seed !== undefined) {
    if (config.supportsSeed !== true) {
      return unsupported("seed", "a seed");
    }
    if (!(Number.isInteger(params.seed) && Number(params.seed) >= 0)) {
      return refusal(
        task,
        model,
        "seed",
        `params.seed must be a whole number of at least 0, not ${JSON.stringify(params.seed)}.`
      );
    }
  }
  if (
    params.negative_prompt !== undefined &&
    config.supportsNegativePrompt !== true
  ) {
    return unsupported("negative_prompt", "a negative prompt");
  }
  const takesSize =
    config.sizeMode === "gpt_size" || config.sizeMode === "image_size_enum";
  return size === undefined || !takesSize
    ? undefined
    : imageSizeRefusal(task, model, config, size);
}

function imageSizeRefusal(
  task: TaskId,
  model: string,
  config: ModelConfig,
  size: unknown
): MotifError | undefined {
  if (isCustomSize(size)) {
    const bounds = config.customImageSize;
    if (
      config.sizeMode === "gpt_size" ||
      bounds === undefined ||
      !withinImageSizeBounds(size, bounds)
    ) {
      return invalidOption(
        `${model} cannot take image_size ${size.width}x${size.height}.`,
        { bounds, field: "params", key: "image_size", model, task }
      );
    }
    return undefined;
  }
  if (typeof size !== "string") {
    return refusal(
      task,
      model,
      "image_size",
      `${model} takes image_size as a preset name or { width, height }.`
    );
  }
  const presets =
    config.sizeMode === "gpt_size" ? GPT_IMAGE_SIZES : FAL_IMAGE_SIZE_PRESETS;
  return presets.includes(size)
    ? undefined
    : refusal(
        task,
        model,
        "image_size",
        `${model} takes image_size ${presets.join(", ")}, not ${size}.`,
        presets
      );
}
