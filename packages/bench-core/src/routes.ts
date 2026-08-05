import { GENERATION_MODELS, MODELS } from "@howells/motif-sdk";
import type { GenerationModelName } from "@howells/motif-sdk";

/**
 * `BenchmarkPricing`-shaped cost provenance for one model, derived entirely
 * from `MODELS[alias].falPricing` — never a hardcoded number. Matches the
 * materialdesk `packages/vision/src/benchmark/types.ts` `BenchmarkPricing`
 * shape (`docs/arc/bench/BRIEF.md` precedent table).
 */
export interface RoutePricing {
  readonly estimateBasis: string;
  readonly estimatedCostUsd: number;
  readonly observedAt: string;
  readonly sourceUrl: string;
}

/**
 * One descriptor per benchmarkable model. This is the only module in
 * `bench-core` that reads `falPricing` — every cost figure elsewhere in the
 * package traces back through here.
 */
export interface BenchRoute {
  readonly alias: GenerationModelName;
  /** `falPricing.unit` verbatim: "images" | "megapixels" | "processed megapixels"
   * | "compute seconds" | "units" — five possible values, never enumerated by
   * alias. Persisted as `bench_samples.cost_basis`. */
  readonly costBasis: string;
  readonly endpoint: string;
  readonly modelName: string;
  readonly pricing: RoutePricing;
  /** `benchmark.speed.p95Seconds` is missing for over half of all models
   * (12 of 23) — the timeout floor is the common path, not an edge case. */
  readonly speedP95Seconds: number | null;
  readonly usesQueue: boolean;
}

/** Thrown when a `GENERATION_MODELS` alias has no `falPricing` — we cannot
 * derive a route without knowing what it costs. */
export class MissingPricingError extends Error {
  readonly alias: GenerationModelName;

  constructor(alias: GenerationModelName) {
    super(`No falPricing entry for model "${alias}" — cannot derive a route`);
    this.name = "MissingPricingError";
    this.alias = alias;
  }
}

/**
 * fal publishes a per-model pricing page at `fal.ai/models/<endpointId>` —
 * `falPricing.endpointId` is the same identifier used to build the request
 * endpoint, so the source URL is derived, not hand-maintained per model.
 */
const sourceUrlFor = (endpointId: string): string =>
  `https://fal.ai/models/${endpointId}`;

const buildRoute = (alias: GenerationModelName): BenchRoute => {
  const config = MODELS[alias];
  const pricing = config?.falPricing;
  if (!config || !pricing) {
    throw new MissingPricingError(alias);
  }

  const estimatedCostUsd = pricing.estimatedCostPerImageUsd;
  if (estimatedCostUsd === undefined) {
    throw new MissingPricingError(alias);
  }

  return {
    alias,
    costBasis: pricing.unit,
    endpoint: config.endpoint,
    modelName: config.name,
    pricing: {
      estimateBasis: `${pricing.unitPrice} × ${pricing.unit} per image, from ${pricing.source} (checked ${pricing.checkedAt})`,
      estimatedCostUsd,
      observedAt: pricing.checkedAt,
      sourceUrl: sourceUrlFor(pricing.endpointId),
    },
    speedP95Seconds: config.benchmark?.speed?.p95Seconds ?? null,
    usesQueue: config.useQueue === true,
  };
};

/** One `BenchRoute` per `GENERATION_MODELS` alias, in the SDK's declared order. */
export const BENCH_ROUTES: readonly BenchRoute[] =
  GENERATION_MODELS.map(buildRoute);

/** Lookup by alias — throws `MissingPricingError` semantics are already
 * resolved at module load via `BENCH_ROUTES`, so this is a plain map read. */
export const BENCH_ROUTES_BY_ALIAS: ReadonlyMap<
  GenerationModelName,
  BenchRoute
> = new Map(BENCH_ROUTES.map((route) => [route.alias, route]));

export const routeFor = (alias: GenerationModelName): BenchRoute => {
  const route = BENCH_ROUTES_BY_ALIAS.get(alias);
  if (!route) {
    throw new MissingPricingError(alias);
  }
  return route;
};
