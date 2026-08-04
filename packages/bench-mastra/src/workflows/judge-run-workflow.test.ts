import { describe, expect, it } from "vitest";

import {
  mockJudgeExecutor,
  mockJudgmentPersistExecutor,
  mockSampleLoaderExecutor,
} from "../executors";
import type {
  JudgeAttemptInput,
  JudgmentPersistExecutor,
  PersistJudgmentInput,
  SampleLoaderExecutor,
  SampleToJudgeRaw,
} from "../executors";
import { createJudgeRunWorkflow, judgeRunWorkflow } from "./judge-run";
import type { JudgeRunSpec } from "./judge-schemas";

const baseSpec: JudgeRunSpec = {
  concurrency: 4,
  isMock: true,
  judgeModel: "mock-vision-model",
  runId: "judge-run-test",
};

const manySamplesLoader = (count: number): SampleLoaderExecutor => ({
  // oxlint-disable-next-line require-await -- the mock's body is synchronous by design (no database)
  loadSamples: async (runId: string): Promise<SampleToJudgeRaw[]> =>
    Array.from({ length: count }, (_unused, index) => ({
      imagePath: `mock/${runId}/${index}.png`,
      prompt: "a room",
      sampleId: `${runId}-sample-${index}`,
    })),
});

describe("judgeRunWorkflow (default mock executors)", () => {
  it("never enables step retries — a judgment costs a real vision-model call", () => {
    expect(judgeRunWorkflow.retryConfig).toEqual({ attempts: 0 });
  });

  it("completes end to end and summarizes a scored sample", async () => {
    const run = await judgeRunWorkflow.createRun();
    const result = await run.start({ inputData: baseSpec });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.result).toEqual({
      inconclusiveCount: 0,
      isMock: true,
      meanOverall: 3,
      runId: "judge-run-test",
      scoredCount: 1,
      totalCount: 1,
    });
  });

  it("runs at the spec's concurrency (the default is 4)", async () => {
    let active = 0;
    let maxActive = 0;
    const trackingExecutor = {
      judge: async (input: JudgeAttemptInput) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => {
          setTimeout(resolve, 15);
        });
        active--;
        return await mockJudgeExecutor.judge(input);
      },
    };
    const workflow = createJudgeRunWorkflow({
      judgeExecutor: trackingExecutor,
      persistExecutor: mockJudgmentPersistExecutor,
      sampleLoaderExecutor: manySamplesLoader(6),
    });

    const run = await workflow.createRun();
    await run.start({ inputData: baseSpec });

    expect(maxActive).toBeLessThanOrEqual(4);
    expect(maxActive).toBeGreaterThan(1);
  });

  it("honors a higher concurrency from the run spec", async () => {
    let active = 0;
    let maxActive = 0;
    const trackingExecutor = {
      judge: async (input: JudgeAttemptInput) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => {
          setTimeout(resolve, 15);
        });
        active--;
        return await mockJudgeExecutor.judge(input);
      },
    };
    const workflow = createJudgeRunWorkflow({
      judgeExecutor: trackingExecutor,
      persistExecutor: mockJudgmentPersistExecutor,
      sampleLoaderExecutor: manySamplesLoader(8),
    });

    const run = await workflow.createRun();
    await run.start({ inputData: { ...baseSpec, concurrency: 8 } });

    expect(maxActive).toBeGreaterThan(4);
    expect(maxActive).toBeLessThanOrEqual(8);
  });

  it("reports one dead judgment as data — it does not fail the run", async () => {
    const failingExecutor = {
      // oxlint-disable-next-line require-await -- the mock's failure is synchronous by design
      judge: async () => {
        throw new Error("upstream vision model 500");
      },
    };
    const workflow = createJudgeRunWorkflow({
      judgeExecutor: failingExecutor,
      persistExecutor: mockJudgmentPersistExecutor,
      sampleLoaderExecutor: mockSampleLoaderExecutor,
    });

    const run = await workflow.createRun();
    const result = await run.start({ inputData: baseSpec });

    // The WORKFLOW itself never throws — only the run's own business outcome
    // reflects the failure, same discipline as `benchmark-run`.
    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.result.scoredCount).toBe(0);
    expect(result.result.inconclusiveCount).toBe(1);
    expect(result.result.meanOverall).toBeNull();
  });

  it("does not fail the run when the persist executor throws for a judgment", async () => {
    const failingPersistExecutor: JudgmentPersistExecutor = {
      // oxlint-disable-next-line require-await -- the mock's failure is synchronous by design
      persistJudgment: async (_input: PersistJudgmentInput) => {
        throw new Error("db unavailable");
      },
    };
    const workflow = createJudgeRunWorkflow({
      judgeExecutor: mockJudgeExecutor,
      persistExecutor: failingPersistExecutor,
      sampleLoaderExecutor: mockSampleLoaderExecutor,
    });

    const run = await workflow.createRun();
    const result = await run.start({ inputData: baseSpec });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.result.scoredCount).toBe(1);
  });

  it("handles a run with no samples to judge", async () => {
    const emptyLoader: SampleLoaderExecutor = {
      // oxlint-disable-next-line require-await -- the mock's body is synchronous by design (no database)
      loadSamples: async () => [],
    };
    const workflow = createJudgeRunWorkflow({
      judgeExecutor: mockJudgeExecutor,
      persistExecutor: mockJudgmentPersistExecutor,
      sampleLoaderExecutor: emptyLoader,
    });

    const run = await workflow.createRun();
    const result = await run.start({ inputData: baseSpec });

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      return;
    }
    expect(result.result).toEqual({
      inconclusiveCount: 0,
      isMock: true,
      meanOverall: null,
      runId: "judge-run-test",
      scoredCount: 0,
      totalCount: 0,
    });
  });
});
