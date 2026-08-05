// Pure domain surface — no `fetch`, no file writes, no fal calls. Every
// impure operation lives in `execute.ts`, reached via the `@motif/bench-core
// /execute` subpath (see package.json `exports`) so that consumers who only
// need alignment/pricing/cost-cap/aggregation logic (e.g. a dry-run preview)
// never pull in Node's `fs`/`fetch` surface.
export {
  ALIGNMENT_SCHEMA_VERSION,
  alignParams,
  outputFormatReach,
} from "./align-params";
export type {
  AlignmentFailed,
  AlignmentOk,
  AlignmentResult,
  AutoSetParam,
  BenchSpec,
  CoercedParam,
  DroppedParam,
} from "./align-params";

export {
  aggregateByModel,
  aggregateCostMicros,
  nearestRankPercentile,
} from "./aggregate";
export type {
  AggregateSampleInput,
  CostAggregate,
  ModelAggregate,
  PhaseTimingSummary,
} from "./aggregate";

export {
  assertWithinCostCap,
  CostCapExceededError,
  CostLedger,
  estimateWorstCaseMicros,
  MissingPricingError,
  usdToMicros,
} from "./cost-ledger";
export type { CostEstimateSpec } from "./cost-ledger";

export { sniffImageDimensions } from "./image-dimensions";
export type { ImageDimensions } from "./image-dimensions";

export { BENCH_ROUTES, BENCH_ROUTES_BY_ALIAS, routeFor } from "./routes";
export type { BenchRoute, RoutePricing } from "./routes";
