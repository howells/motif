/**
 * What a tool plan knows of its output before the run, for the prices that
 * read it: the output count, the scale and the size of each output.
 */

import { FAL_PRESET_SIZES } from "./aspects";
import type { TaskInput } from "./task-client";
import { isCustomSize, sourceSizeOf } from "./task-plan-shared";
import type { OutputDimensions, SourceFacts } from "./tool-cost";
import { FAL_TOOL_PARAMETERS } from "./tool-parameters.generated";
import type { FalToolParameter } from "./tool-parameters.generated";
import type { FalToolConfig } from "./tool-types";
import { FAL_TOOLS } from "./tools";
import type { FalToolId } from "./tools";
import type { CustomImageSize } from "./types";

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
export function projectedOutputs(
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
export function sourceFacts(input: TaskInput): SourceFacts {
  const image = sourceSizeOf(input);
  return {
    ...(image !== undefined && { image }),
    ...(input.sourceVideo !== undefined && { video: input.sourceVideo }),
  };
}
