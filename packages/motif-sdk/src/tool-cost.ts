/**
 * What a tool run costs, before it happens and after.
 *
 * The registry's `price` is a rate, not a total. Turning a rate into a figure
 * needs something only one of the two moments has:
 *
 *   - Before the call, a `call` price is the whole answer and nothing else is.
 *     A per-megapixel rate depends on an output that does not exist yet.
 *   - After the call, the output exists and has been measured, so a
 *     per-megapixel rate resolves exactly. Most of the restoration suite is
 *     priced this way, which means most of what looked unknowable at dry-run
 *     time is knowable by the time it reaches history.
 *
 * Both functions return `null` rather than `0` where the figure is genuinely
 * unavailable. Zero is a claim that something was free, and every price defect
 * found in this registry has been a confident wrong number rather than an
 * absent one.
 */

import { dataUrlImageSize } from "./source-size";
import type { FalToolPrice } from "./tool-types";

/** Pixel dimensions of one file an endpoint returned. */
export interface OutputDimensions {
  height?: number;
  width?: number;
}

/** What a caller knows of a source video before a run, read from its header. */
export interface SourceVideo {
  fps?: number;
  frames?: number;
  height?: number;
  seconds: number;
  width?: number;
}

/** The source a run reads, as far as it is known before the run. */
export interface SourceFacts {
  image?: { height: number; width: number };
  video?: SourceVideo;
}

/** A cost, and enough context for a caller to say why it is what it is. */
export interface ResolvedCost {
  /** USD, or null when the rate cannot be resolved against what we know. */
  usd: number | null;
  /**
   * Whether `usd` was measured from real output or projected from the rate
   * alone. Callers that display a figure should say which; an estimate and a
   * bill are not the same claim.
   */
  basis: "measured" | "projected" | "unknown";
}

const UNKNOWN: ResolvedCost = { basis: "unknown", usd: null };

/** Total megapixels across every measured output. Null if none carry dimensions. */
function totalMegapixels(outputs: readonly OutputDimensions[]): number | null {
  let pixels = 0;
  let measured = 0;
  for (const output of outputs) {
    if (output.width !== undefined && output.height !== undefined) {
      pixels += output.width * output.height;
      measured += 1;
    }
  }
  return measured === 0 ? null : pixels / 1_000_000;
}

/** USD for outputs billed per started step of megapixels. Null if none carry dimensions. */
function steppedPrice(
  price: Extract<FalToolPrice, { kind: "megapixel-step" }>,
  outputs: readonly OutputDimensions[]
): number | null {
  let usd = 0;
  let measured = 0;
  for (const output of outputs) {
    if (output.width !== undefined && output.height !== undefined) {
      const megapixels = (output.width * output.height) / 1_000_000;
      usd += price.usd * Math.max(1, Math.ceil(megapixels / price.megapixels));
      measured += 1;
    }
  }
  return measured === 0 ? null : usd;
}

/** How many of something a body key holds: an array's length, a number, else 1. */
function countOf(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  return typeof value === "number" ? value : 1;
}

/** A call price, per image where it says so, plus every extra the body switches on. */
function callPrice(
  price: Extract<FalToolPrice, { kind: "call" }>,
  body: Readonly<Record<string, unknown>>
): number {
  const images =
    price.perImage === true && typeof body.num_images === "number"
      ? body.num_images
      : 1;
  let usd = price.usd * images;
  for (const key of price.per ?? []) {
    usd *= countOf(body[key]);
  }
  for (const [key, table] of Object.entries(price.multipliers ?? {})) {
    usd *= table[String(body[key])] ?? 1;
  }
  for (const [key, extra] of Object.entries(price.extras ?? {})) {
    if (body[key] === true) {
      usd += extra;
    }
  }
  return usd + (price.fee ?? 0);
}

/** FLUX.2's first output megapixel, then every further megapixel of input and output. */
function megapixelFirstPrice(
  price: Extract<FalToolPrice, { kind: "megapixel-first" }>,
  outputs: readonly OutputDimensions[],
  source: { height: number; width: number } | undefined
): number | null {
  const output = totalMegapixels(outputs);
  if (output === null || source === undefined) {
    return null;
  }
  const input = Math.ceil((source.width * source.height) / 1_000_000);
  const extra = Math.max(1, Math.ceil(output)) - 1 + input;
  return price.first + price.extra * extra;
}

/** PBR maps, from each map's measured or projected size and the body's upscale factor. */
function mapsPrice(
  price: Extract<FalToolPrice, { kind: "maps" }>,
  outputs: readonly OutputDimensions[],
  body: Readonly<Record<string, unknown>>
): number | null {
  const total = totalMegapixels(outputs);
  const maps = outputs.filter(
    (output) => output.width !== undefined && output.height !== undefined
  ).length;
  if (total === null) {
    return null;
  }
  const factor =
    typeof body.upscale_factor === "number" && body.upscale_factor > 1
      ? body.upscale_factor
      : 1;
  const beforeUpscale = total / (factor * factor);
  const surcharge = price.upscale?.[String(body.upscale_factor)] ?? 0;
  return (
    price.base +
    (price.perMegapixel * beforeUpscale) / maps +
    (price.perMapMegapixel + surcharge) * beforeUpscale
  );
}

/** Topaz video: the tier the output's shorter side falls in, times the source's seconds. */
function videoSecondPrice(
  price: Extract<FalToolPrice, { kind: "video-second" }>,
  body: Readonly<Record<string, unknown>>,
  video: SourceVideo | undefined
): number | null {
  if (video?.width === undefined || video.height === undefined) {
    return null;
  }
  const factor =
    typeof body.upscale_factor === "number" ? body.upscale_factor : 1;
  const lines = Math.min(video.width, video.height) * factor;
  const tier = price.tiers.find(
    (candidate) => candidate.upTo === undefined || lines <= candidate.upTo
  );
  if (tier === undefined) {
    return null;
  }
  const fps = typeof body.target_fps === "number" ? body.target_fps : video.fps;
  let rate = tier.usd;
  if (
    price.doubleAtFps !== undefined &&
    fps !== undefined &&
    fps >= price.doubleAtFps
  ) {
    rate *= 2;
  }
  if (price.halfWithModel !== undefined && body.model === price.halfWithModel) {
    rate /= 2;
  }
  return rate * video.seconds;
}

/** Frames of a source video: counted from its header, else its seconds at its frame rate. */
function framesOf(video: SourceVideo | undefined): number | undefined {
  if (video?.frames !== undefined) {
    return video.frames;
  }
  return video?.fps === undefined
    ? undefined
    : Math.round(video.seconds * video.fps);
}

function resolvedCost(
  usd: number | null,
  basis: ResolvedCost["basis"]
): ResolvedCost {
  return usd === null ? UNKNOWN : { basis, usd };
}

/**
 * The figure to show before a run, from the rate alone.
 *
 * A flat per-call price is the whole answer. A per-megapixel rate projects only
 * from `outputs` whose size is already known, such as a source the tool
 * returns at its own size or scales by a known factor; guessing a size is how
 * a dry run comes to promise a number the invoice contradicts. Per-second and
 * per-frame rates project from the source video's header, and a token rate
 * from the estimates its registry entry records.
 */
export function projectedToolCost(
  price: FalToolPrice,
  body: Readonly<Record<string, unknown>> = {},
  outputs: readonly OutputDimensions[] = [],
  source: SourceFacts = {}
): ResolvedCost {
  switch (price.kind) {
    case "call": {
      return { basis: "projected", usd: callPrice(price, body) };
    }
    case "megapixel": {
      const megapixels = totalMegapixels(outputs);
      return resolvedCost(
        megapixels === null ? null : price.usd * megapixels,
        "projected"
      );
    }
    case "megapixel-step": {
      return resolvedCost(steppedPrice(price, outputs), "projected");
    }
    case "megapixel-first": {
      return resolvedCost(
        megapixelFirstPrice(price, outputs, source.image),
        "projected"
      );
    }
    case "maps": {
      return resolvedCost(mapsPrice(price, outputs, body), "projected");
    }
    case "second": {
      return resolvedCost(
        source.video === undefined ? null : price.usd * source.video.seconds,
        "projected"
      );
    }
    case "video-second": {
      return resolvedCost(
        videoSecondPrice(price, body, source.video),
        "projected"
      );
    }
    case "frames": {
      const frames = framesOf(source.video);
      return resolvedCost(
        frames === undefined
          ? null
          : price.usd * Math.max(1, Math.ceil(frames / price.frames)),
        "projected"
      );
    }
    case "token": {
      return {
        basis: "projected",
        usd:
          (price.inputPerMillion * price.inputTokens +
            price.outputPerMillion * price.outputTokens) /
          1_000_000,
      };
    }
    case "metered": {
      break;
    }
  }
  return UNKNOWN;
}

/**
 * The figure to record after a run, from the rate and the output it produced.
 *
 * A per-megapixel rate becomes exact here, because the files have been written
 * and measured. Per-second, per-frame and per-token rates need a duration, a
 * frame count or a token count the output doesn't carry, and metered endpoints
 * publish no rate at all, so all of them stay unknown.
 */
export function measuredToolCost(
  price: FalToolPrice,
  outputs: readonly OutputDimensions[],
  body: Readonly<Record<string, unknown>> = {}
): ResolvedCost {
  switch (price.kind) {
    case "call": {
      return { basis: "measured", usd: callPrice(price, body) };
    }
    case "megapixel": {
      const megapixels = totalMegapixels(outputs);
      return resolvedCost(
        megapixels === null ? null : price.usd * megapixels,
        "measured"
      );
    }
    case "megapixel-step": {
      return resolvedCost(steppedPrice(price, outputs), "measured");
    }
    case "megapixel-first": {
      const source =
        typeof body.image_url === "string"
          ? dataUrlImageSize(body.image_url)
          : undefined;
      return resolvedCost(
        megapixelFirstPrice(price, outputs, source),
        "measured"
      );
    }
    case "maps": {
      return resolvedCost(mapsPrice(price, outputs, body), "measured");
    }
    case "second":
    case "video-second":
    case "frames":
    case "token":
    case "metered": {
      break;
    }
  }
  return UNKNOWN;
}

/**
 * Render a cost for a human. `null` never becomes "$0.000" - it says what it
 * means, which is that nobody knows.
 */
export function formatCost(usd: number | null): string {
  return usd === null ? "metered" : `$${usd.toFixed(3)}`;
}

/**
 * Sum costs that are known, and count the ones that are not.
 *
 * A running total that silently drops unknown runs reads as complete. Callers
 * are expected to show both halves: "$1.23 plus 4 metered runs" is honest where
 * "$1.23" is not.
 */
export function sumCosts(costs: readonly (number | null)[]): {
  known: number;
  unknown: number;
} {
  let known = 0;
  let unknown = 0;
  for (const cost of costs) {
    if (cost === null) {
      unknown += 1;
    } else {
      known += cost;
    }
  }
  return { known, unknown };
}
