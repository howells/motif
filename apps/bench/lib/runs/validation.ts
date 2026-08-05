/**
 * Request-body validation for the run-creation and preview endpoints. A
 * client-side bug (or a tampered request) must never reach
 * `mock-engine.ts`/`mock-store.ts` with an out-of-range value — the cost cap
 * in particular is a server-side guarantee, not a UI courtesy.
 */
import { GENERATION_MODELS } from "@howells/motif-sdk";
import { z } from "zod";

import { BENCH_ASPECTS } from "@/lib/aspect";
import { BENCH_OUTPUT_FORMATS } from "@/lib/runs/types";

export const RunSpecInputSchema = z.object({
  aspect: z.enum(BENCH_ASPECTS),
  concurrency: z.number().int().min(1).max(8),
  judgeAfter: z.boolean(),
  maxEstimatedCostUsd: z.number().positive().max(50),
  // Bounded by the live registry, not a hand-pinned count — a pinned 23
  // silently rejected full sweeps the day qwen3 became the 24th model.
  models: z.array(z.string().min(1)).min(1).max(GENERATION_MODELS.length),
  // Nullable with a null default so a client that omits it keeps the
  // pre-existing "each model's own default" behaviour rather than failing.
  outputFormat: z.enum(BENCH_OUTPUT_FORMATS).nullable().default(null),
  prompt: z.string().trim().min(1).max(2000),
  resolution: z.enum(["0.5K", "1K", "2K", "4K"]),
  samplesPerModel: z.number().int().min(1).max(4),
  seed: z.number().int().nullable(),
});

export const ManualRatingInputSchema = z.object({
  note: z.string().max(500).nullable().optional(),
  stars: z.number().int().min(1).max(5),
});

export const RetryRunInputSchema = z.object({
  /** Absent means "every failed sample in this run" — the sheet-level
   * button. Present narrows to the named samples, which is how a single
   * failed frame retries just itself. Ids that name a sample which is not
   * `failed` (or is not in this run at all) are filtered out by `planRetry`
   * rather than rejected here: what is retryable is a property of the run's
   * current state, not of the request, and a stale client holding an id that
   * has since succeeded should get a no-op, not a 400. */
  sampleIds: z.array(z.string().min(1)).min(1).max(500).optional(),
});

export const JudgeRunInputSchema = z.object({
  /** An explicit POST /judge means "judge again": without this, a run whose
   * samples all carry rank rows from a previous pass is silently skipped
   * (the skip exists so the automatic post-run trigger is idempotent), and
   * two "re-judges" in production no-opped while reporting started:true. */
  force: z.boolean().default(true),
  judgeModel: z.string().min(1).max(100).default("mock-vision-judge-v1"),
});
