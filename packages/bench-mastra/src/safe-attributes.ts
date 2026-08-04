/**
 * Closed vocabulary of span attribute keys the benchmark harness is allowed to
 * emit, each with its own value schema. Ported from materialdesk's
 * `packages/telemetry/src/safe-attributes.ts` (`docs/arc/bench/BRIEF.md`
 * precedent table) and narrowed to the bench-specific keyset the team lead
 * specified.
 *
 * `safeParseTelemetryAttribute` is the only way code outside this file should
 * turn an arbitrary `(key, value)` pair into something safe to hand to
 * `span.end({ metadata })` / `span.update()`: an unknown key is dropped, and a
 * known key with a value that fails its schema is dropped too — never
 * coerced, never passed through. This is what keeps a prompt, a fal URL, or a
 * base64 data URI from ever reaching Langfuse (`BRIEF.md` rules 1 and 3).
 */
import { z } from "zod";

/** Same closed error vocabulary as `bench-core/execute.ts` — provider text
 * never reaches a span; only one of these eight codes may. */
const BenchErrorCodeSchema = z.enum([
  "TIMEOUT",
  "RATE_LIMITED",
  "HTTP_4XX",
  "HTTP_5XX",
  "SAFETY",
  "NO_IMAGE",
  "DOWNLOAD_FAILED",
  "INTERRUPTED",
]);

/** `falPricing.unit` — the five values confirmed in `BRIEF.md`. A sixth unit
 * introduced upstream would fail this schema and be dropped rather than
 * corrupt a span with an unrecognized value; `bench-core/routes.ts` (which
 * derives `costBasis`) is where a new unit would need to be taught. */
const CostBasisSchema = z.enum([
  "images",
  "megapixels",
  "processed megapixels",
  "compute seconds",
  "units",
]);

// `z.number()` already rejects `Infinity`/`-Infinity` in zod v4 — `.finite()`
// is a documented no-op here, kept off to avoid the deprecation warning.
const finiteNonnegativeNumberSchema = z.number().nonnegative();
const nonnegativeIntSchema = z.number().int().nonnegative();
const positiveIntSchema = z.number().int().positive();

/** Rejects anything URL-shaped (a fal CDN link, a data URI) or long enough to
 * plausibly be prompt text — model aliases and param names are short bare
 * identifiers, never either of those things. */
const urlLikePattern = /(?:^[a-z][a-z0-9+.-]*:\/\/|^www\.|^data:)/iu;
const shortIdentifierSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9._-]*$/iu)
  .refine((value) => !urlLikePattern.test(value));

/** `bench.dropped_params` carries param *names* (`"aspect"`, `"seed"`), never
 * the values or the reason text — capped well below prompt length. */
const droppedParamsSchema = z.array(shortIdentifierSchema).max(16);

export const SafeBenchAttributeKeySchema = z.enum([
  "bench.model",
  "bench.sample_index",
  "bench.concurrency",
  "bench.provider_ms",
  "bench.download_ms",
  "bench.cost_micros",
  "bench.cost_basis",
  "bench.width",
  "bench.height",
  "bench.error.code",
  "bench.dropped_params",
  "bench.queue_polled",
]);

const safeAttributeValueSchemas = {
  "bench.model": shortIdentifierSchema,
  "bench.sample_index": nonnegativeIntSchema,
  "bench.concurrency": positiveIntSchema,
  "bench.provider_ms": finiteNonnegativeNumberSchema,
  "bench.download_ms": finiteNonnegativeNumberSchema,
  // Integer micros throughout (`BRIEF.md` rule 8) — never a float, never a
  // bigint (bigints don't serialize through span metadata anyway).
  "bench.cost_micros": nonnegativeIntSchema,
  "bench.cost_basis": CostBasisSchema,
  "bench.width": positiveIntSchema,
  "bench.height": positiveIntSchema,
  "bench.error.code": BenchErrorCodeSchema,
  "bench.dropped_params": droppedParamsSchema,
  "bench.queue_polled": z.boolean(),
} as const satisfies Record<string, z.ZodType>;

export type SafeBenchAttributeKey = z.infer<typeof SafeBenchAttributeKeySchema>;
export type SafeBenchAttributeValue = z.infer<
  (typeof safeAttributeValueSchemas)[SafeBenchAttributeKey]
>;
export type SafeBenchAttributes = Partial<
  Record<SafeBenchAttributeKey, SafeBenchAttributeValue>
>;

/**
 * Validate a single `(key, value)` pair against the closed vocabulary. Returns
 * `null` for an unknown key or a value that fails that key's schema — the
 * caller drops it rather than guessing at a coercion.
 */
export const safeParseBenchAttribute = (
  key: string,
  value: unknown
): { key: SafeBenchAttributeKey; value: SafeBenchAttributeValue } | null => {
  const parsedKey = SafeBenchAttributeKeySchema.safeParse(key);
  if (!parsedKey.success) {
    return null;
  }
  const parsedValue =
    safeAttributeValueSchemas[parsedKey.data].safeParse(value);
  return parsedValue.success
    ? { key: parsedKey.data, value: parsedValue.data }
    : null;
};

/**
 * Filters an arbitrary attribute bag down to only the entries that survive
 * `safeParseBenchAttribute` — the shape `span.end({ metadata })` and
 * `span.update({ attributes })` want. Every dropped entry is silently
 * excluded, never thrown: a bad attribute must never fail a benchmark run.
 */
export const buildSafeBenchAttributes = (
  candidate: Record<string, unknown>
): SafeBenchAttributes => {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(candidate)) {
    const parsed = safeParseBenchAttribute(key, value);
    if (parsed !== null) {
      safe[parsed.key] = parsed.value;
    }
  }
  return safe;
};
