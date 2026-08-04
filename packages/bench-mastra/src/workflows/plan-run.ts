import { GENERATION_MODELS } from "@howells/motif-sdk";
import type { GenerationModelName } from "@howells/motif-sdk";
import { createStep } from "@mastra/core/workflows";
/**
 * `planRun`: turns a `BenchRunSpec` into the array of `(model, sample)` work
 * items `.foreach` fans out over in `benchmark-run.ts`.
 *
 * Everything here is a call into `@motif/bench-core`'s pure domain functions
 * (`alignParams`, `routeFor`, `assertWithinCostCap`) — no `fetch`, no file
 * I/O, no env read. `assertWithinCostCap` runs first and throws
 * `CostCapExceededError` before any work item is built, satisfying
 * `BRIEF.md` rule 5 ("a hard `maxEstimatedCostUsd` throws BEFORE any provider
 * work") — a thrown error here fails the whole run rather than becoming
 * error-as-data, which is correct: an over-cap request should never
 * partially proceed.
 *
 * `deadlineAt` is computed once, from the slowest selected model's own
 * timeout (`perModelTimeoutMs`, `./constants.ts`), and copied onto every work
 * item — the single run-level deadline every concurrent `generate` step
 * races (`./deadline.ts`), rather than each model getting a fresh cap sized
 * only to itself.
 */
import {
  alignParams,
  assertWithinCostCap,
  routeFor,
  usdToMicros,
} from "@motif/bench-core";
import type { BenchSpec } from "@motif/bench-core";
import { z } from "zod";

import { perModelTimeoutMs } from "./constants";
import { BenchRunSpecSchema, ModelWorkItemSchema } from "./schemas";
import type { ModelWorkItem } from "./schemas";

const KNOWN_MODEL_NAMES: readonly string[] = GENERATION_MODELS;

/** Narrows a `spec.models` entry to `GenerationModelName` via a runtime
 * membership check against `GENERATION_MODELS` — never an unchecked `as`
 * cast. An unrecognized alias fails the whole run before any provider work,
 * the same posture as the cost-cap check below. */
function assertGenerationModelName(
  value: string
): asserts value is GenerationModelName {
  if (!KNOWN_MODEL_NAMES.includes(value)) {
    throw new Error(
      `Unknown model alias "${value}" — not in GENERATION_MODELS`
    );
  }
}

export const planRunStep = createStep({
  description:
    "Resolve alignment, cost, and timing for every (model, sample) work item; enforce the cost cap before any provider work runs.",
  // oxlint-disable-next-line require-await -- execute must return a Promise; every call in this body (alignParams, routeFor, assertWithinCostCap) is synchronous
  execute: async (params) => {
    const spec = params.inputData;
    const aliases: GenerationModelName[] = spec.models.map((alias) => {
      assertGenerationModelName(alias);
      return alias;
    });

    assertWithinCostCap(
      { models: aliases, samplesPerModel: spec.samplesPerModel },
      spec.maxEstimatedCostUsd
    );

    const benchSpec: BenchSpec = {
      aspect: spec.aspect,
      outputFormat: spec.outputFormat,
      prompt: spec.prompt,
      resolution: spec.resolution,
      seed: spec.seed,
    };

    const routes = aliases.map((alias) => routeFor(alias));
    const runTimeoutMs = Math.max(
      ...routes.map((route) => perModelTimeoutMs(route.speedP95Seconds))
    );
    const deadlineAt = Date.now() + runTimeoutMs;

    const items: ModelWorkItem[] = [];
    let executionOrdinal = 0;
    for (const alias of aliases) {
      const route = routeFor(alias);
      const costEstimatedMicros = usdToMicros(route.pricing.estimatedCostUsd);
      const timeoutFallbackMs = perModelTimeoutMs(route.speedP95Seconds);

      for (
        let sampleIndex = 0;
        sampleIndex < spec.samplesPerModel;
        sampleIndex++
      ) {
        const alignment = alignParams(alias, benchSpec, sampleIndex);
        const ordinal = executionOrdinal;
        executionOrdinal += 1;

        items.push({
          alias,
          // Carried verbatim — `generate.ts` needs `alignment.options` (the
          // real `GenerateOptions`) to call a real executor; see
          // `AlignmentResultSchema` in `./schemas.ts` for why this is not
          // re-derived field by field.
          alignment,
          costBasis: route.costBasis,
          costEstimatedMicros,
          deadlineAt,
          endpoint: route.endpoint,
          executionOrdinal: ordinal,
          modelName: route.modelName,
          runId: spec.runId,
          sampleIndex,
          timeoutFallbackMs,
          usesQueue: route.usesQueue,
        });
      }
    }

    return items;
  },
  id: "plan-run",
  inputSchema: BenchRunSpecSchema,
  outputSchema: z.array(ModelWorkItemSchema),
});
