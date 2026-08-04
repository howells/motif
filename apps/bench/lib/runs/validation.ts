/**
 * Request-body validation for the run-creation and preview endpoints. A
 * client-side bug (or a tampered request) must never reach
 * `mock-engine.ts`/`mock-store.ts` with an out-of-range value — the cost cap
 * in particular is a server-side guarantee, not a UI courtesy.
 */
import { z } from "zod";

import { BENCH_ASPECTS } from "@/lib/aspect";

export const RunSpecInputSchema = z.object({
  aspect: z.enum(BENCH_ASPECTS),
  concurrency: z.number().int().min(1).max(8),
  judgeAfter: z.boolean(),
  maxEstimatedCostUsd: z.number().positive().max(50),
  models: z.array(z.string().min(1)).min(1).max(23),
  prompt: z.string().trim().min(1).max(2000),
  resolution: z.enum(["0.5K", "1K", "2K", "4K"]),
  samplesPerModel: z.number().int().min(1).max(4),
  seed: z.number().int().nullable(),
});

export const ManualRatingInputSchema = z.object({
  note: z.string().max(500).nullable().optional(),
  stars: z.number().int().min(1).max(5),
});

export const JudgeRunInputSchema = z.object({
  judgeModel: z.string().min(1).max(100).default("mock-vision-judge-v1"),
});
