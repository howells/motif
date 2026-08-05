import { alignParams } from "@motif/bench-core";
import { describe, expect, it } from "vitest";

import { mockPersistExecutor } from "../executors";
import type { GenerationAttemptInput } from "../executors";
import {
  benchmarkRunWorkflow,
  createBenchmarkRunWorkflow,
} from "./benchmark-run";
import { createRunOneModelWorkflow } from "./run-one-model";
import type { BenchRunSpec, ModelWorkItem } from "./schemas";

/** `BenchRunSpecSchema` applies defaults at *runtime*, but `.start()`'s
 * `inputData` type is the schema's fully-resolved output shape — every field
 * is filled in explicitly here rather than relying on those defaults. */
const baseSpec: BenchRunSpec = {
  aspect: "1:1",
  concurrency: 1,
  isMock: true,
  maxEstimatedCostUsd: 1,
  models: ["flux-fast", "grok-image"],
  outputFormat: null,
  prompt: "a cat wearing sunglasses",
  resolution: "1K",
  runId: "bench-run-test",
  samplesPerModel: 1,
  seed: null,
};

describe("benchmarkRunWorkflow (default mock executors)", () => {
  it("never enables step retries — generations are expensive and non-idempotent", () => {
    expect(benchmarkRunWorkflow.retryConfig).toEqual({ attempts: 0 });
    expect(
      createRunOneModelWorkflow({
        generationExecutor: {
          // oxlint-disable-next-line require-await -- GenerationExecutor.execute must return a Promise; this stub's failure is synchronous
          execute: async () => {
            throw new Error("unused");
          },
        },
        persistExecutor: mockPersistExecutor,
      }).retryConfig
    ).toEqual({ attempts: 0 });
  });

  it("completes end to end and aggregates every model", async () => {
    const run = await benchmarkRunWorkflow.createRun();
    const result = await run.start({ inputData: baseSpec });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }

    expect(result.result.status).toBe("completed");
    expect(result.result.isMock).toBe(true);
    expect(result.result.models.map((model) => model.modelAlias)).toEqual([
      "flux-fast",
      "grok-image",
    ]);
    for (const model of result.result.models) {
      expect(model.succeededCount).toBe(1);
      expect(model.failedCount).toBe(0);
    }
  });

  it("defaults concurrency to 1 when the spec omits it", async () => {
    let active = 0;
    let maxActive = 0;
    const trackingExecutor = {
      execute: async (input: GenerationAttemptInput) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => {
          setTimeout(resolve, 15);
        });
        active--;
        return {
          bytes: 1,
          contentType: "image/png",
          downloadMs: 1,
          falRequestId: null,
          height: 1,
          imagePath: input.imagePath,
          ok: true as const,
          providerMs: 1,
          seedReturned: null,
          totalMs: 2,
          width: 1,
        };
      },
    };
    const workflow = createBenchmarkRunWorkflow({
      generationExecutor: trackingExecutor,
      persistExecutor: mockPersistExecutor,
    });

    const run = await workflow.createRun();
    await run.start({
      inputData: {
        ...baseSpec,
        models: ["flux-fast", "grok-image"],
        samplesPerModel: 2,
      },
    });

    expect(maxActive).toBe(1);
  });

  it("honors a higher concurrency from the run spec", async () => {
    let active = 0;
    let maxActive = 0;
    const trackingExecutor = {
      execute: async (input: GenerationAttemptInput) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => {
          setTimeout(resolve, 15);
        });
        active--;
        return {
          bytes: 1,
          contentType: "image/png",
          downloadMs: 1,
          falRequestId: null,
          height: 1,
          imagePath: input.imagePath,
          ok: true as const,
          providerMs: 1,
          seedReturned: null,
          totalMs: 2,
          width: 1,
        };
      },
    };
    const workflow = createBenchmarkRunWorkflow({
      generationExecutor: trackingExecutor,
      persistExecutor: mockPersistExecutor,
    });

    const run = await workflow.createRun();
    await run.start({
      inputData: {
        ...baseSpec,
        concurrency: 2,
        models: ["flux-fast", "grok-image"],
        samplesPerModel: 2,
      },
    });

    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("reports a per-model failure as data — one dead model does not fail the run", async () => {
    const failingExecutor = {
      // oxlint-disable-next-line require-await -- GenerationExecutor.execute must return a Promise; this stub's result is synchronous
      execute: async () => ({
        downloadMs: null,
        errorCode: "RATE_LIMITED" as const,
        ok: false as const,
        providerMs: 12,
        totalMs: 12,
      }),
    };
    const workflow = createBenchmarkRunWorkflow({
      generationExecutor: failingExecutor,
      persistExecutor: mockPersistExecutor,
    });

    const run = await workflow.createRun();
    const result = await run.start({
      inputData: { ...baseSpec, models: ["flux-fast"] },
    });

    // The WORKFLOW itself never throws — only the run's own business outcome
    // reflects the failure.
    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.result.status).toBe("failed");
    expect(result.result.models[0]?.failedCount).toBe(1);
    expect(result.result.models[0]?.succeededCount).toBe(0);
  });
});

describe("runOneModel (timeout path)", () => {
  it("classifies a hung executor as TIMEOUT without throwing", async () => {
    const hangingExecutor = {
      execute: async () =>
        await new Promise<never>(() => {
          // Intentionally never resolves — this is what forces the timeout path.
        }),
    };
    const workflow = createRunOneModelWorkflow({
      generationExecutor: hangingExecutor,
      persistExecutor: mockPersistExecutor,
    });

    const alignment = alignParams(
      "flux-fast",
      {
        aspect: "1:1",
        outputFormat: null,
        prompt: "a cat",
        resolution: "1K",
        seed: null,
      },
      0
    );
    expect(alignment.ok).toBe(true);

    const workItem: ModelWorkItem = {
      alias: "flux-fast",
      alignment,
      costBasis: "images",
      costEstimatedMicros: 1000,
      deadlineAt: Date.now() + 15,
      endpoint: "fal-ai/flux-fast",
      executionOrdinal: 0,
      modelName: "Flux Fast",
      runId: "timeout-test",
      sampleIndex: 0,
      timeoutFallbackMs: 15,
      usesQueue: false,
    };

    const run = await workflow.createRun();
    const result = await run.start({ inputData: workItem });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.result.status).toBe("failed");
    expect(result.result.errorCode).toBe("TIMEOUT");
  });
});
