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

import type { FalToolPrice } from "./tool-types";

/** Pixel dimensions of one file an endpoint returned. */
export interface OutputDimensions {
  height?: number;
  width?: number;
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

/**
 * The figure to show before a run, from the rate alone.
 *
 * Only a flat per-call price survives this: everything else depends on an
 * output that does not exist yet, and guessing its size is how a dry run comes
 * to promise a number the invoice contradicts.
 */
export function projectedToolCost(price: FalToolPrice): ResolvedCost {
  return price.kind === "call"
    ? { basis: "projected", usd: price.usd }
    : UNKNOWN;
}

/**
 * The figure to record after a run, from the rate and the output it produced.
 *
 * A per-megapixel rate becomes exact here, because the files have been written
 * and measured. Per-second rates need a duration nothing in the image path
 * carries, and metered endpoints publish no rate at all, so both stay unknown.
 */
export function measuredToolCost(
  price: FalToolPrice,
  outputs: readonly OutputDimensions[]
): ResolvedCost {
  if (price.kind === "call") {
    return { basis: "measured", usd: price.usd };
  }
  if (price.kind === "megapixel") {
    const megapixels = totalMegapixels(outputs);
    return megapixels === null
      ? UNKNOWN
      : { basis: "measured", usd: price.usd * megapixels };
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
