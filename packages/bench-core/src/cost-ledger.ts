import type { GenerationModelName } from "@howells/motif-sdk";

// `MissingPricingError` is the single "we cannot compute a safe cost" failure
// for the whole package — `routes.ts` is the only module that knows about
// `falPricing`, so it owns the error, and this module (which never reads
// `falPricing` directly) re-exports it rather than defining a second one. An
// unknown per-image cost can never be treated as zero in a worst-case sum
// (`BRIEF.md` rule 9), so a request naming an unpriced model is a hard
// failure, not a silently-skipped model.
import { routeFor } from "./routes";

export { MissingPricingError } from "./routes";

/** Costs are integer micros throughout (`BRIEF.md` rule 8) — never floats,
 * never bigint. $1 = 1_000_000 micros. */
export const usdToMicros = (usd: number): number => Math.round(usd * 1_000_000);

export interface CostEstimateSpec {
  readonly models: readonly GenerationModelName[];
  readonly samplesPerModel: number;
}

/** Thrown by `assertWithinCostCap` and `CostLedger.reserve` — always before
 * any provider work (`BRIEF.md` rule 5). */
export class CostCapExceededError extends Error {
  readonly capMicros: number;
  readonly projectedMicros: number;

  constructor(projectedMicros: number, capMicros: number) {
    super(
      `Projected cost ${projectedMicros} micros exceeds the hard cap of ${capMicros} micros`
    );
    this.name = "CostCapExceededError";
    this.capMicros = capMicros;
    this.projectedMicros = projectedMicros;
  }
}

/**
 * Worst-case cost of a run: every requested model's `estimatedCostPerImageUsd`
 * (from `routes.ts`, in turn from `falPricing`) times `samplesPerModel`,
 * summed in integer micros. This is a *ceiling*, not a forecast — refinement
 * against actually-returned megapixels happens per attempt in `execute.ts`,
 * never here.
 */
export const estimateWorstCaseMicros = (spec: CostEstimateSpec): number => {
  let totalMicros = 0;
  for (const alias of spec.models) {
    const route = routeFor(alias); // throws UnknownPricingError if unmapped
    totalMicros +=
      usdToMicros(route.pricing.estimatedCostUsd) * spec.samplesPerModel;
  }
  return totalMicros;
};

/**
 * Computes the worst-case cost and throws `CostCapExceededError` if it
 * exceeds `maxEstimatedCostUsd` — before any provider work runs. Callers
 * must call this (or route through `CostLedger`) ahead of every attempt.
 */
export const assertWithinCostCap = (
  spec: CostEstimateSpec,
  maxEstimatedCostUsd: number
): number => {
  const worstCaseMicros = estimateWorstCaseMicros(spec);
  const capMicros = usdToMicros(maxEstimatedCostUsd);
  if (worstCaseMicros > capMicros) {
    throw new CostCapExceededError(worstCaseMicros, capMicros);
  }
  return worstCaseMicros;
};

type AttemptState =
  | {
      readonly actualMicros: number | null;
      readonly estimatedMicros: number;
      readonly state: "finished";
    }
  | { readonly estimatedMicros: number; readonly state: "reserved" };

/**
 * Two-phase reserve/finish ledger, one instance per run. `reserve` is called
 * before an attempt's provider call and throws `CostCapExceededError` if the
 * projected total (already-committed + this attempt's worst case) would
 * exceed the run's hard cap — so the cap is enforced *before* spend, not
 * after. `finish` records the attempt's actual cost, which may be `null`
 * (unknown must stay distinguishable from zero — `BRIEF.md` rule 9).
 */
export class CostLedger {
  private readonly attempts = new Map<string, AttemptState>();
  private readonly capMicros: number;

  constructor(maxEstimatedCostUsd: number) {
    this.capMicros = usdToMicros(maxEstimatedCostUsd);
  }

  /** Sum of every attempt's committed cost: the estimate while reserved, the
   * actual (or, if unknown, the estimate) once finished. This is what
   * `reserve` projects against the cap — never the confirmed-actual-only
   * total, which would let reservations silently blow past the cap while
   * still "in flight". */
  get committedMicros(): number {
    let total = 0;
    for (const attempt of this.attempts.values()) {
      total +=
        attempt.state === "reserved"
          ? attempt.estimatedMicros
          : (attempt.actualMicros ?? attempt.estimatedMicros);
    }
    return total;
  }

  /** Total of only the *known* actual costs across finished attempts. `null`
   * when no finished attempt has a known actual cost yet — distinguishable
   * from a legitimate $0 total. */
  get actualKnownMicros(): number | null {
    const known: number[] = [];
    for (const attempt of this.attempts.values()) {
      if (attempt.state === "finished" && attempt.actualMicros !== null) {
        known.push(attempt.actualMicros);
      }
    }
    return known.length === 0
      ? null
      : known.reduce((sum, value) => sum + value, 0);
  }

  reserve(attemptId: string, estimatedMicros: number): void {
    if (this.attempts.has(attemptId)) {
      throw new Error(`Attempt "${attemptId}" is already on the ledger`);
    }
    const projectedMicros = this.committedMicros + estimatedMicros;
    if (projectedMicros > this.capMicros) {
      throw new CostCapExceededError(projectedMicros, this.capMicros);
    }
    this.attempts.set(attemptId, { estimatedMicros, state: "reserved" });
  }

  finish(attemptId: string, actualMicros: number | null): void {
    const attempt = this.attempts.get(attemptId);
    if (!attempt || attempt.state !== "reserved") {
      throw new Error(`Attempt "${attemptId}" is not reserved on the ledger`);
    }
    this.attempts.set(attemptId, {
      actualMicros,
      estimatedMicros: attempt.estimatedMicros,
      state: "finished",
    });
  }
}
