/**
 * The most one planned provider call can cost, or a refusal.
 *
 * The App reserves this figure against the shared monthly cap before it calls
 * fal, so it has to be a ceiling, not a forecast. `TaskPlan.cost` is a
 * projection and is never used as one. Instead each Model the App can run is
 * named below with the rate fal bills it at and the largest variant of that
 * rate, read from the SDK registry and its pricing notes. Anything else is
 * refused: a metered Model, one billed per token or per compute second, one
 * whose bill depends on a size the App can't know before the call, and any
 * Model not listed. A refusal is final for the request; nothing estimates a
 * way round it.
 *
 * A headroom of a quarter sits on every ceiling so a quiet fal price rise
 * between SDK releases is still held. The recorded cost replaces the hold
 * when the run settles, so headroom costs nothing once a run finishes.
 */

import {
  FAL_PRESET_SIZES,
  FAL_TOOLS,
  isFalToolId,
} from "@motif/bench-core/sdk-internal";
import type { FalToolPrice } from "@motif/bench-core/sdk-internal";

/** Integer micros: $1 = 1,000,000. */
const MICROS_PER_USD = 1_000_000;

const HEADROOM_NUMERATOR = 5;
const HEADROOM_DENOMINATOR = 4;

export interface Size {
  readonly height: number;
  readonly width: number;
}

/** What the App knows before the call, besides the plan itself. */
export interface BoundContext {
  /** The Source's pixel size, for Tasks that change one. */
  readonly source?: Size;
  /** Each Reference's pixel size, in the order sent. */
  readonly references: readonly Size[];
}

/** The planned call, as the SDK planned it. */
export interface PlannedCall {
  readonly body: Readonly<Record<string, unknown>>;
  readonly model: string;
  readonly provider: "fal" | "openai";
  readonly task: string;
}

export type Bound =
  | {
      readonly kind: "bounded";
      /** The ceiling to hold, headroom included, in micros. */
      readonly micros: number;
      /** The ceiling before headroom, in micros, for display. */
      readonly listMicros: number;
      /** How the ceiling was worked out, in a sentence. */
      readonly basis: string;
    }
  | {
      readonly kind: "unbounded";
      /** Why the App can't hold a maximum for this call, in a sentence. */
      readonly reason: string;
    };

const unbounded = (reason: string): Bound => ({ kind: "unbounded", reason });

const toMicros = (usd: number): number => Math.ceil(usd * MICROS_PER_USD);

const bounded = (usd: number, basis: string): Bound => {
  const listMicros = toMicros(usd);
  if (!Number.isFinite(listMicros) || listMicros <= 0) {
    return unbounded("The provider lists no positive price for this call.");
  }
  return {
    basis,
    kind: "bounded",
    listMicros,
    micros: Math.ceil((listMicros * HEADROOM_NUMERATOR) / HEADROOM_DENOMINATOR),
  };
};

const megapixels = (size: Size): number => (size.width * size.height) / 1e6;

const countOf = (body: Readonly<Record<string, unknown>>): number | null => {
  const value = body.num_images;
  if (value === undefined) {
    return 1;
  }
  return typeof value === "number" && Number.isInteger(value) && value >= 1
    ? value
    : null;
};

/** The pixel size of an `image_size` body value: exact, or a named preset. */
const imageSizeOf = (value: unknown): Size | null => {
  if (typeof value === "string") {
    return FAL_PRESET_SIZES[value] ?? null;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "width" in value &&
    "height" in value &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    value.width > 0 &&
    value.height > 0
  ) {
    return { height: value.height, width: value.width };
  }
  return null;
};

/**
 * Generation and editing Models billed a fixed amount per image. `usd` is the
 * highest tier fal lists for the Model (its largest size or setting), plus
 * every per-request extra the body could switch on; `perInput` is added for
 * each Reference on an edit. Sources: the SDK registry's `pricing` text for
 * each Model and apps/cli/docs/costs.md.
 */
const PER_IMAGE: Readonly<
  Record<
    string,
    { readonly usd: number; readonly perInput?: number; readonly note: string }
  >
> = {
  banana: { note: "$0.15, or $0.30 at 4K, plus $0.015 search", usd: 0.315 },
  banana2: {
    note: "$0.06 to $0.16 by resolution, plus $0.015 search and $0.002 thinking",
    usd: 0.177,
  },
  "grok-image": { note: "$0.02 per image", perInput: 0.01, usd: 0.02 },
  "grok-image-2": {
    note: "$0.06 at 1K, $0.08 at 2K, plus $0.01 per input image",
    perInput: 0.01,
    usd: 0.08,
  },
  "grok-image-quality": {
    note: "$0.05 at 1K, $0.07 at 2K, plus $0.01 per input image",
    perInput: 0.01,
    usd: 0.07,
  },
  "ideogram3-transparent": {
    note: "$0.03 turbo, $0.06 balanced, $0.09 quality",
    usd: 0.09,
  },
  "muse-image": { note: "$0.01 per image", usd: 0.01 },
  qwen3: { note: "$0.04 at 1K, $0.075 at 2K", usd: 0.075 },
  recraft41: { note: "$0.035 per image", usd: 0.035 },
  seedream5: { note: "$0.0675 to 1536², $0.135 to 2048²", usd: 0.135 },
  "seedream5-lite": { note: "$0.035 per image", usd: 0.035 },
};

/**
 * Generation and editing Models billed per processed megapixel, input and
 * output, each image rounded up to a whole megapixel. FLUX.2 pro's
 * first-megapixel price is lower than this for every size, so the same
 * formula holds it.
 */
const PER_PROCESSED_MEGAPIXEL: Readonly<Record<string, number>> = {
  "flux2-flex": 0.05,
  "flux2-pro": 0.03,
  "flux2-turbo": 0.008,
  krea3: 0.025,
};

/** Tool Models whose cheapest listed call is not their dearest. */
const CALL_VARIANT_CEILING: Readonly<
  Record<string, { readonly usd: number; readonly note: string }>
> = {
  "finegrain-eraser": { note: "$0.18 express to $0.36 premium", usd: 0.36 },
  "ideogram-reframe": {
    note: "$0.03 turbo to $0.09 quality per image",
    usd: 0.09,
  },
};

/** Tool Models billed per started step of output megapixels whose step can
 * shrink with a model setting: hold the smallest step fal lists. */
const STEP_FLOOR_MEGAPIXELS: Readonly<Record<string, number>> = {
  "topaz-generative": 4,
};

/** Upscalers outside the tool registry, billed per output megapixel. */
const UPSCALER_PER_MEGAPIXEL: Readonly<Record<string, number>> = {
  clarity: 0.03,
};

/** The Tasks and Models the App runs in phase 1. Everything else is refused,
 * whatever its price. */
const PHASE_ONE_TASKS = new Set([
  "cutout",
  "erase",
  "generate",
  "reframe",
  "upscale",
  "vary",
]);

const scaleOf = (body: Readonly<Record<string, unknown>>): number | null => {
  const value = body.upscale_factor ?? body.scale;
  if (value === undefined) {
    return null;
  }
  return typeof value === "number" && value >= 1 && value <= 8 ? value : null;
};

const marginsOf = (
  body: Readonly<Record<string, unknown>>
): { readonly x: number; readonly y: number } | null => {
  const read = (key: string): number | null => {
    const value = body[key] ?? 0;
    return typeof value === "number" && value >= 0 ? value : null;
  };
  const top = read("expand_top");
  const bottom = read("expand_bottom");
  const left = read("expand_left");
  const right = read("expand_right");
  if (top === null || bottom === null || left === null || right === null) {
    return null;
  }
  return { x: left + right, y: top + bottom };
};

/** The output size of a tool call, where the App can know it before the call. */
const toolOutputSize = (
  call: PlannedCall,
  source: Size | undefined
): Size | null => {
  const { body, model } = call;
  if (source === undefined) {
    return null;
  }
  if (model === "topaz-transparent") {
    // Always four times the Source's width and height.
    return { height: source.height * 4, width: source.width * 4 };
  }
  if (model === "flux-outpaint") {
    const margins = marginsOf(body);
    return margins === null
      ? null
      : { height: source.height + margins.y, width: source.width + margins.x };
  }
  const scale = scaleOf(body);
  if (scale !== null) {
    return { height: source.height * scale, width: source.width * scale };
  }
  // An upscale must name its factor: a Model's own default isn't in the body,
  // so holding the Source's size would hold too little.
  if (call.task === "upscale") {
    return null;
  }
  // Background removal and erasing return the Source at its own size.
  return source;
};

const maxMultiplier = (table: Readonly<Record<string, number>>): number =>
  Math.max(1, ...Object.values(table));

/** A registry call price at its dearest: every multiplier at its largest
 * value and every extra switched on. */
const callCeiling = (
  price: Extract<FalToolPrice, { kind: "call" }>,
  body: Readonly<Record<string, unknown>>,
  count: number
): number | null => {
  let usd = price.usd * (price.perImage === true ? count : 1);
  for (const key of price.per ?? []) {
    const value = body[key];
    const times = Array.isArray(value)
      ? value.length
      : typeof value === "number"
        ? value
        : 1;
    usd *= times;
  }
  for (const table of Object.values(price.multipliers ?? {})) {
    usd *= maxMultiplier(table);
  }
  for (const extra of Object.values(price.extras ?? {})) {
    usd += extra;
  }
  return usd + (price.fee ?? 0);
};

const toolBound = (call: PlannedCall, context: BoundContext): Bound => {
  if (!isFalToolId(call.model)) {
    return unbounded(`${call.model} isn't a Model the App can price.`);
  }
  const price: FalToolPrice = FAL_TOOLS[call.model].price;
  const count = countOf(call.body);
  if (count === null) {
    return unbounded("The number of images requested isn't a whole number.");
  }
  const variant = CALL_VARIANT_CEILING[call.model];
  switch (price.kind) {
    case "call": {
      if (price.usd === 0) {
        return unbounded(
          `fal bills ${call.model} per compute second and lists no maximum, so it can't be held.`
        );
      }
      const listed = callCeiling(price, call.body, count);
      if (listed === null) {
        return unbounded(`${call.model}'s price can't be worked out.`);
      }
      if (variant !== undefined) {
        const perUnit = price.perImage === true ? count : 1;
        return bounded(
          Math.max(listed, variant.usd * perUnit),
          `Highest listed price for ${call.model}: ${variant.note}`
        );
      }
      return bounded(listed, `fal's flat price for ${call.model}`);
    }
    case "megapixel": {
      const size = toolOutputSize(call, context.source);
      return size === null
        ? unbounded(
            `${call.model} bills by output size, which isn't known yet.`
          )
        : bounded(
            price.usd * Math.ceil(megapixels(size)),
            `$${price.usd} per output megapixel, rounded up`
          );
    }
    case "megapixel-step": {
      const size = toolOutputSize(call, context.source);
      if (size === null) {
        return unbounded(
          `${call.model} bills by output size, which isn't known yet.`
        );
      }
      const step = Math.min(
        price.megapixels,
        STEP_FLOOR_MEGAPIXELS[call.model] ?? price.megapixels
      );
      return bounded(
        price.usd * Math.max(1, Math.ceil(megapixels(size) / step)),
        `$${price.usd} per started ${step} output megapixels`
      );
    }
    case "megapixel-first": {
      const size = toolOutputSize(call, context.source);
      if (size === null || context.source === undefined) {
        return unbounded(
          `${call.model} bills by output size, which isn't known yet.`
        );
      }
      const processed =
        Math.ceil(megapixels(size)) + Math.ceil(megapixels(context.source));
      return bounded(
        price.first * processed,
        `$${price.first} per megapixel of input and output, rounded up`
      );
    }
    case "frames":
    case "maps":
    case "metered":
    case "second":
    case "token":
    case "video-second": {
      return unbounded(
        `fal bills ${call.model} by ${price.kind}, which has no maximum the App can hold.`
      );
    }
    default: {
      throw new TypeError(`Unknown price kind for ${call.model}.`);
    }
  }
};

const generationBound = (call: PlannedCall, context: BoundContext): Bound => {
  const count = countOf(call.body);
  if (count === null) {
    return unbounded("The number of images requested isn't a whole number.");
  }
  const flat = PER_IMAGE[call.model];
  if (flat !== undefined) {
    const inputs = (flat.perInput ?? 0) * context.references.length;
    return bounded(
      flat.usd * count + inputs,
      `Highest listed price: ${flat.note}`
    );
  }
  const rate = PER_PROCESSED_MEGAPIXEL[call.model];
  if (rate !== undefined) {
    const output = imageSizeOf(call.body.image_size);
    if (output === null) {
      return unbounded(
        `${call.model} bills by size, and the size isn't fixed in the request.`
      );
    }
    const inputMegapixels = context.references.reduce(
      (sum, size) => sum + Math.ceil(megapixels(size)),
      0
    );
    return bounded(
      rate * (count * Math.ceil(megapixels(output)) + inputMegapixels),
      `$${rate} per processed megapixel, input and output, rounded up`
    );
  }
  return unbounded(
    `${call.model} bills by usage and publishes no maximum, so the App can't hold what it might cost.`
  );
};

/** The ceiling to reserve for one planned call, or why there isn't one. */
export const boundFor = (call: PlannedCall, context: BoundContext): Bound => {
  if (!PHASE_ONE_TASKS.has(call.task)) {
    return unbounded(`${call.task} isn't in the App yet.`);
  }
  if (call.provider !== "fal") {
    return unbounded(
      `${call.model} runs on ${call.provider}, which bills by token and can't be resumed.`
    );
  }
  const upscaler = UPSCALER_PER_MEGAPIXEL[call.model];
  if (upscaler !== undefined) {
    const scale = scaleOf(call.body);
    if (scale === null || context.source === undefined) {
      return unbounded(
        `${call.model} bills by output size, which isn't known yet.`
      );
    }
    const size = {
      height: context.source.height * scale,
      width: context.source.width * scale,
    };
    return bounded(
      upscaler * Math.ceil(megapixels(size)),
      `$${upscaler} per output megapixel, rounded up`
    );
  }
  if (call.task === "generate" || call.task === "vary") {
    return generationBound(call, context);
  }
  return toolBound(call, context);
};

/** Models the bound table names, for tests and the Compare picker. */
export const BOUNDED_GENERATION_MODELS: readonly string[] = [
  ...Object.keys(PER_IMAGE),
  ...Object.keys(PER_PROCESSED_MEGAPIXEL),
];
