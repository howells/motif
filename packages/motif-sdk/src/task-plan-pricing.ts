/**
 * What a generation request bills and which body keys the caller owns. Both
 * read the body as sent, `params` included, because fal bills that body.
 */

import {
  FAL_PRESET_SIZES,
  RESOLUTIONS,
  withinImageSizeBounds,
} from "./aspects";
import { estimateCost } from "./cost";
import type { MotifError } from "./errors";
import type { TaskInput } from "./task-client";
import { invalidOption, isPresent, projected } from "./task-plan-shared";
import type { CarriedField } from "./task-plan-shared";
import type { TaskId } from "./tasks";
import type { ResolvedCost } from "./tool-cost";
import type { CustomImageSize, ModelConfig, Resolution } from "./types";

/** Megapixels a Model's fal price is metered in, when it is. */
function megapixelRate(config: ModelConfig): number | undefined {
  const pricing = config.falPricing;
  return pricing !== undefined && pricing.unit.includes("megapixel")
    ? pricing.unitPrice
    : undefined;
}

function isCustomSize(value: unknown): value is CustomImageSize {
  return (
    typeof value === "object" &&
    value !== null &&
    "width" in value &&
    "height" in value &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
}

/** Pixels of an `image_size` value: exact, or a named preset's. */
function imageSizePixels(value: unknown): number | undefined {
  if (isCustomSize(value)) {
    return value.width * value.height;
  }
  const preset =
    typeof value === "string" ? FAL_PRESET_SIZES[value] : undefined;
  return preset === undefined ? undefined : preset.width * preset.height;
}

function resolutionOf(value: unknown): Resolution | undefined {
  const upper = typeof value === "string" ? value.toUpperCase() : undefined;
  return RESOLUTIONS.find((resolution) => resolution === upper);
}

/**
 * Projected cost from the body as sent, `params` included: the image count,
 * resolution and size fal bills are whatever the body says. A megapixel-priced
 * Model is priced from the exact or preset pixels.
 */
export function generationCost(
  model: string,
  config: ModelConfig,
  body: Record<string, unknown>
): ResolvedCost {
  const count =
    config.supportsNumImages && typeof body.num_images === "number"
      ? body.num_images
      : 1;
  const rate = megapixelRate(config);
  const pixels = imageSizePixels(body.image_size);
  if (rate !== undefined && pixels !== undefined) {
    return projected((rate * pixels * count) / 1_000_000);
  }
  return projected(estimateCost(model, resolutionOf(body.resolution), count));
}

/** Body keys each TaskInput field sets, so `params` can't replace them. */
const GENERATION_KEYS: Readonly<
  Partial<Record<CarriedField, readonly string[]>>
> = {
  aspect: ["aspect_ratio", "image_size"],
  count: ["num_images"],
  look: ["prompt"],
  mood: ["prompt"],
  negativePrompt: ["negative_prompt"],
  outputFormat: ["output_format"],
  prompt: ["prompt"],
  resolution: ["resolution", "image_size"],
  seed: ["seed"],
  transparent: ["background", "output_format"],
};

/**
 * Keys owned by the caller's fields, whatever value they hold: a caller who
 * passed `count: 1` has set `num_images`, even though 1 is also the default.
 * Source, mask and reference fields are URL keys, refused by `mergeParams`.
 */
export function ownedGenerationKeys(input: TaskInput): Set<string> {
  const owned = new Set(["prompt"]);
  for (const [field, keys] of Object.entries(GENERATION_KEYS)) {
    if (isCarriedField(field) && isPresent(input, field)) {
      for (const key of keys) {
        owned.add(key);
      }
    }
  }
  return owned;
}

function isCarriedField(field: string): field is CarriedField {
  return Object.hasOwn(GENERATION_KEYS, field);
}

/** Refuse an `image_size` from `params` the Model can't take or that's out of bounds. */
export function checkParamsImageSize(
  config: ModelConfig,
  model: string,
  task: TaskId,
  params: TaskInput["params"]
): MotifError | undefined {
  const value = params?.image_size;
  if (!isCustomSize(value)) {
    return undefined;
  }
  const bounds = config.customImageSize;
  if (bounds === undefined || !withinImageSizeBounds(value, bounds)) {
    return invalidOption(
      `${model} cannot take image_size ${value.width}x${value.height}.`,
      { bounds, field: "params", key: "image_size", model, task }
    );
  }
  return undefined;
}
