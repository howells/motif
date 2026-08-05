import { workflowThen } from "@howells/mastra/workflows";
import { createWorkflow } from "@mastra/core/workflows";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { TIMEOUT_FLOOR_MS } from "./constants";
import { planRunStep } from "./plan-run";
import { BenchRunSpecSchema, ModelWorkItemSchema } from "./schemas";
import type { BenchRunSpec } from "./schemas";

/** Drives `planRunStep` through the real engine (materialdesk convention:
 * `workflow.createRun()` + `run.start()`, never a hand-built execute-params
 * object) via a single-step throwaway workflow. `workflowThen` (not `.then`
 * directly) is the same `no-then`-lint-safe wrapper the real workflows use. */
const planOnlyWorkflow = workflowThen(
  createWorkflow({
    id: "plan-run-test",
    inputSchema: BenchRunSpecSchema,
    outputSchema: z.array(ModelWorkItemSchema),
  }),
  planRunStep
).commit();

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
  runId: "plan-test-run",
  samplesPerModel: 1,
  seed: null,
};

describe("planRunStep", () => {
  it("produces one work item per (model, sample), in the requested model order", async () => {
    const run = await planOnlyWorkflow.createRun();
    const result = await run.start({
      inputData: { ...baseSpec, samplesPerModel: 2 },
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }

    expect(result.result).toHaveLength(4);
    expect(result.result.map((item) => [item.alias, item.sampleIndex])).toEqual(
      [
        ["flux-fast", 0],
        ["flux-fast", 1],
        ["grok-image", 0],
        ["grok-image", 1],
      ]
    );
    expect(result.result.map((item) => item.executionOrdinal)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("resolves alignment eagerly and ok for every valid model", async () => {
    const run = await planOnlyWorkflow.createRun();
    const result = await run.start({ inputData: baseSpec });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }

    for (const item of result.result) {
      expect(item.alignment.ok).toBe(true);
    }
  });

  it("shares one deadlineAt across every item, sized from the slowest selected model", async () => {
    const run = await planOnlyWorkflow.createRun();
    const result = await run.start({ inputData: baseSpec });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }

    const deadlines = new Set(result.result.map((item) => item.deadlineAt));
    expect(deadlines.size).toBe(1);

    // flux-fast has no benchmark.speed.p95Seconds (BRIEF.md verified ground
    // truth) — it is one of the 12/23 models that fall back to the explicit
    // floor, which therefore drives the shared run deadline here.
    const [deadlineAt] = deadlines;
    expect(deadlineAt).toBeGreaterThanOrEqual(
      Date.now() + TIMEOUT_FLOOR_MS - 1000
    );
  });

  it("throws before any work item is built when the worst case exceeds the cost cap", async () => {
    const run = await planOnlyWorkflow.createRun();
    const result = await run.start({
      inputData: { ...baseSpec, maxEstimatedCostUsd: 0.0000001 },
    });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") {
      return;
    }
    expect(result.error.message).toMatch(/exceeds the hard cap/u);
  });
});
