import type {
  AspectRatio,
  CustomImageSize,
  ImageSizeBounds,
  Resolution,
} from "./types";

/** Ordered by popularity: square first, then common ratios */
export const ASPECT_RATIOS: AspectRatio[] = [
  "auto",
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "21:9",
  "4:1",
  "1:4",
  "8:1",
  "1:8",
];

export const RESOLUTIONS: Resolution[] = ["0.5K", "1K", "2K", "4K"];

/** Map aspect ratio to GPT image_size (GPT doesn't support arbitrary aspects) */
export function aspectToGptSize(aspect: AspectRatio): string {
  switch (aspect) {
    case "auto": {
      return "auto";
    }
    case "9:16":
    case "1:8":
    case "1:4":
    case "2:3":
    case "4:5":
    case "3:4": {
      return "1024x1536";
    }
    case "16:9":
    case "8:1":
    case "4:1":
    case "3:2":
    case "5:4":
    case "4:3":
    case "21:9": {
      return "1536x1024";
    }
    case "1:1": {
      return "1024x1024";
    }
    default: {
      return "1024x1024";
    }
  }
}

/**
 * Map aspect ratio to fal.ai image_size enum.
 * Used by FLUX Schnell, Recraft, Ideogram, and other models that accept
 * named size presets rather than aspect ratio strings.
 */
export function aspectToFalImageSize(aspect: AspectRatio): string {
  switch (aspect) {
    case "auto": {
      return "auto";
    }
    case "16:9":
    case "21:9":
    case "4:1":
    case "8:1": {
      return "landscape_16_9";
    }
    case "3:2":
    case "5:4": {
      return "landscape_4_3";
    }
    case "4:3": {
      return "landscape_4_3";
    }
    case "9:16":
    case "1:4":
    case "1:8": {
      return "portrait_16_9";
    }
    case "2:3":
    case "4:5": {
      return "portrait_4_3";
    }
    case "3:4": {
      return "portrait_4_3";
    }
    case "1:1": {
      return "square_hd";
    }
    default: {
      return "square_hd";
    }
  }
}

/** Aspect ratios fal's named `image_size` presets hold exactly. */
export const FAL_PRESET_ASPECTS: readonly AspectRatio[] = [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
];

/** Long edge, in pixels, targeted for each resolution tier. */
export const RESOLUTION_LONG_EDGE: Record<Resolution, number> = {
  "0.5K": 768,
  "1K": 1536,
  "2K": 2048,
  "4K": 4096,
};

/**
 * Long edge of fal's named `image_size` presets (`landscape_4_3` is 1024x768),
 * the size a Model without a resolution setting produces.
 */
export const FAL_PRESET_LONG_EDGE = 1024;

/** Pixel sizes of fal's named `image_size` presets. `auto` has none. */
export const FAL_PRESET_SIZES: Readonly<Record<string, CustomImageSize>> = {
  landscape_16_9: { height: 576, width: 1024 },
  landscape_4_3: { height: 768, width: 1024 },
  portrait_16_9: { height: 1024, width: 576 },
  portrait_4_3: { height: 1024, width: 768 },
  square: { height: 512, width: 512 },
  square_hd: { height: 1024, width: 1024 },
};

const ASPECT_TERMS_REGEX = /^(\d+):(\d+)$/;

/** Both edges of an exact size are multiples of this unless bounds say otherwise. */
const EDGE_MULTIPLE = 16;

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** The ratio's terms in lowest form, or null for `"auto"`. */
function ratioTerms(aspect: AspectRatio): [number, number] | null {
  const terms = ASPECT_TERMS_REGEX.exec(aspect);
  if (terms === null) {
    return null;
  }
  const width = Number(terms[1]);
  const height = Number(terms[2]);
  const divisor = greatestCommonDivisor(width, height);
  return [width / divisor, height / divisor];
}

/** The largest multiple of `unit` whose scaled long edge stays within `longEdge`. */
function scaleWithin(longEdge: number, longTerm: number, unit: number): number {
  return Math.max(unit, unit * Math.floor(longEdge / (unit * longTerm)));
}

function roundUpTo(value: number, unit: number): number {
  return unit * Math.ceil(value / unit);
}

/**
 * Exact pixel dimensions for an aspect ratio at a resolution tier, or null for
 * `"auto"`.
 *
 * `aspectToFalImageSize` buckets a ratio into one of fal's named presets, which
 * turns 2:3 into 3:4 and 21:9 into 16:9. Endpoints whose `image_size` also
 * takes `{ width, height }` get the real ratio instead. Both edges are whole
 * multiples of the ratio's terms, so the ratio is exact, and multiples of 16.
 * The long edge never exceeds the tier's.
 */
export function exactImageSize(
  aspect: AspectRatio,
  resolution: Resolution
): CustomImageSize | null {
  const terms = ratioTerms(aspect);
  if (terms === null) {
    return null;
  }
  const [width, height] = terms;
  const scale = scaleWithin(
    RESOLUTION_LONG_EDGE[resolution],
    Math.max(width, height),
    EDGE_MULTIPLE
  );
  return { height: height * scale, width: width * scale };
}

/** Whether a size sits inside an endpoint's limits. */
export function withinImageSizeBounds(
  size: CustomImageSize,
  bounds: ImageSizeBounds
): boolean {
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  const pixels = size.width * size.height;
  return !(
    (bounds.maxRatio !== undefined && long / short > bounds.maxRatio) ||
    (bounds.maxEdge !== undefined && long > bounds.maxEdge) ||
    (bounds.minEdge !== undefined && short < bounds.minEdge) ||
    (bounds.maxPixels !== undefined && pixels > bounds.maxPixels) ||
    (bounds.minPixels !== undefined && pixels < bounds.minPixels)
  );
}

/**
 * The exact size for an aspect on an endpoint with limits: the long edge as
 * close to `longEdge` as the ratio allows without passing it, then scaled up
 * only as far as a minimum edge or pixel count demands. Null for `"auto"`.
 * Undefined when no size in that ratio fits the limits: the caller refuses,
 * because rounding to another ratio is the defect this exists to remove.
 */
export function boundedImageSize(
  aspect: AspectRatio,
  longEdge: number,
  bounds: ImageSizeBounds
): CustomImageSize | null | undefined {
  const terms = ratioTerms(aspect);
  if (terms === null) {
    return null;
  }
  const [width, height] = terms;
  const unit = bounds.multipleOf ?? EDGE_MULTIPLE;
  let scale = scaleWithin(longEdge, Math.max(width, height), unit);
  if (bounds.minEdge !== undefined) {
    scale = Math.max(
      scale,
      roundUpTo(bounds.minEdge / Math.min(width, height), unit)
    );
  }
  if (bounds.minPixels !== undefined) {
    scale = Math.max(
      scale,
      roundUpTo(Math.sqrt(bounds.minPixels / (width * height)), unit)
    );
  }
  const size = { height: height * scale, width: width * scale };
  return withinImageSizeBounds(size, bounds) ? size : undefined;
}

/**
 * Thrown by `buildGenerateBody` when a ratio no fal preset holds has no exact
 * size inside the Model's limits.
 */
export class ImageSizeBoundsError extends Error {
  readonly code = "INVALID_OPTION";
  readonly aspect: AspectRatio;
  readonly bounds: ImageSizeBounds;

  constructor(model: string, aspect: AspectRatio, bounds: ImageSizeBounds) {
    super(
      `${model} has no image size in ratio ${aspect} within its limits: ${JSON.stringify(bounds)}.`
    );
    this.name = "ImageSizeBoundsError";
    this.aspect = aspect;
    this.bounds = bounds;
  }
}

/** Format presets that set aspect + resolution in one click */
export const FORMAT_PRESETS: Record<
  string,
  { label: string; aspect: AspectRatio; resolution?: Resolution }
> = {
  cover: { aspect: "2:3", label: "Cover", resolution: "2K" },
  landscape: { aspect: "16:9", label: "Landscape" },
  og: { aspect: "16:9", label: "OG Image" },
  portrait: { aspect: "2:3", label: "Portrait" },
  square: { aspect: "1:1", label: "Square" },
  story: { aspect: "9:16", label: "Story" },
  wide: { aspect: "21:9", label: "Wide" },
};
