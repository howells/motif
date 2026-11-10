/**
 * What a resolution tier means for a Model, read from the same tables and
 * request builders the planner uses, so `--describe` and a real request cannot
 * disagree. The tier names (0.5K to 4K) are not pixel counts: how many pixels
 * one asks for depends on the Model's kind of sizing.
 */

import {
  DEFAULT_GENERATION_RESOLUTION,
  DEFAULT_TOOL_RESOLUTION,
  exactImageSize,
  requestedSize,
  RESOLUTIONS,
} from "./aspects";
import { buildGenerateBody } from "./generate";
import { FAL_TOOL_PARAMETERS } from "./tool-parameters.generated";
import type { FalToolParameter } from "./tool-parameters.generated";
import type { CustomImageSize, ModelConfig, Resolution } from "./types";

/**
 * How a Model is sized:
 * - `exact`: Motif asks for an exact width and height from the ratio and tier.
 * - `preset`: a fal named size (about 1024 px on the long edge); no tier.
 * - `fixed`: a few fixed sizes chosen by ratio; no tier.
 * - `model`: Motif sends the ratio and tier and the Model decides the pixels.
 * - `source`: the output keeps the source's size, scaled by the tier where the
 *   endpoint takes one.
 * - `none`: the Model takes no size.
 */
export type SizingKind =
  | "exact"
  | "preset"
  | "fixed"
  | "model"
  | "source"
  | "none";

export interface ModelSizing {
  readonly kind: SizingKind;
  /** Tiers the Model accepts. Empty when it takes none. */
  readonly resolutions: readonly Resolution[];
  /** The tier sent when none is asked for, where the Model takes tiers. */
  readonly defaultResolution?: Resolution;
  /** At ratio 1:1, the size each tier asks for (`exact` Models). */
  readonly tierSizes?: Readonly<Partial<Record<Resolution, CustomImageSize>>>;
  /** At ratio 1:1, the size asked for with no tier (`preset` and `fixed`). */
  readonly size?: CustomImageSize;
}

const AUTO_TIER_PREFIX = "auto_";
const ENUM_TYPE_REGEX = /^enum\((.*)\)$/;

function isResolution(value: string): value is Resolution {
  return RESOLUTIONS.some((resolution) => resolution === value);
}

export function generationSizing(id: string, config: ModelConfig): ModelSizing {
  const resolutions = config.supportsResolution
    ? (config.supportedResolutions ?? RESOLUTIONS)
    : [];
  const defaultResolution = resolutions.includes(DEFAULT_GENERATION_RESOLUTION)
    ? DEFAULT_GENERATION_RESOLUTION
    : undefined;
  const mode = config.sizeMode ?? "aspect_ratio";
  const sizeAt = (resolution?: Resolution): CustomImageSize | null => {
    try {
      const { body } = buildGenerateBody({
        aspect: "1:1",
        model: id,
        prompt: "size",
        resolution,
      });
      return requestedSize(body);
    } catch {
      return null;
    }
  };
  if (mode === "none") {
    return { kind: "none", resolutions };
  }
  if (mode === "aspect_ratio") {
    return {
      kind: "model",
      resolutions,
      ...(defaultResolution !== undefined && { defaultResolution }),
    };
  }
  if (mode === "gpt_size") {
    const size = sizeAt();
    return { kind: "fixed", resolutions, ...(size !== null && { size }) };
  }
  if (!config.supportsResolution) {
    const size = sizeAt();
    return { kind: "preset", resolutions, ...(size !== null && { size }) };
  }
  const tierSizes: Partial<Record<Resolution, CustomImageSize>> = {};
  for (const resolution of resolutions) {
    const size = sizeAt(resolution);
    if (size !== null) {
      tierSizes[resolution] = size;
    }
  }
  return {
    kind: "exact",
    resolutions,
    tierSizes,
    ...(defaultResolution !== undefined && { defaultResolution }),
  };
}

function enumValues(parameter: FalToolParameter | undefined): string[] {
  const match = ENUM_TYPE_REGEX.exec(parameter?.type ?? "");
  return match?.[1] === undefined ? [] : match[1].split("|");
}

export function toolSizing(tool: string): ModelSizing {
  const parameters = FAL_TOOL_PARAMETERS[tool] ?? [];
  const imageSize = parameters.find(({ key }) => key === "image_size");
  const exact =
    parameters.some(({ key }) => key === "canvas_size") ||
    (imageSize !== undefined && imageSize.type.includes("object"));
  if (exact) {
    const tierSizes: Partial<Record<Resolution, CustomImageSize>> = {};
    for (const resolution of RESOLUTIONS) {
      const size = exactImageSize("1:1", resolution);
      if (size !== null) {
        tierSizes[resolution] = size;
      }
    }
    return {
      defaultResolution: DEFAULT_TOOL_RESOLUTION,
      kind: "exact",
      resolutions: RESOLUTIONS,
      tierSizes,
    };
  }
  if (imageSize !== undefined) {
    const resolutions = enumValues(imageSize)
      .filter((value) => value.startsWith(AUTO_TIER_PREFIX))
      .map((value) => value.slice(AUTO_TIER_PREFIX.length))
      .filter(isResolution);
    return { kind: "source", resolutions };
  }
  return { kind: "none", resolutions: [] };
}
