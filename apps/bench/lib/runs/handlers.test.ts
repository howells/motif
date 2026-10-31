import { randomUUID } from "node:crypto";
import type * as crypto from "node:crypto";

import type * as runtimeEnvironment from "@motif/bench-env/runtime";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { createRequestStoreForAPI } from "next/dist/server/async-storage/request-store";
import { createWorkStore } from "next/dist/server/async-storage/work-store";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  createRunResponse as startRun,
  listRunsResponse as listRuns,
  retryRunResponse as retryRun,
  runDetailResponse as pollRun,
} from "./handlers";

const platform = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  Object.defineProperty(globalThis, "AsyncLocalStorage", {
    configurable: true,
    value: AsyncLocalStorage,
  });
  return { hosted: false };
});

// Keep workspace credentials and all external effects outside this API test.
vi.mock("@motif/bench-env/runtime", async (importOriginal) => {
  const original = await importOriginal<typeof runtimeEnvironment>();
  return {
    ...original,
    getLiveCredentials: () => null,
    isVercelRuntime: () => platform.hosted,
  };
});
vi.mock("@motif/bench-db/client", () => ({
  db: () => {
    throw new Error("Run API regression must not connect to a database");
  },
}));
vi.mock("node:crypto", async (importOriginal) => {
  const original = await importOriginal<typeof crypto>();
  return { ...original, randomUUID: vi.fn(original.randomUUID) };
});

const SPEC = {
  aspect: "1:1",
  concurrency: 1,
  judgeAfter: false,
  maxEstimatedCostUsd: 5,
  models: ["flux2-pro"],
  prompt: "A well-lit living room",
  resolution: "1K",
  samplesPerModel: 2,
  seed: null,
};

interface IdContext {
  params: Promise<{ id: string }>;
}
interface RunApi {
  list: () => Promise<Response>;
  poll: (request: Request, context: IdContext) => Promise<Response>;
  retry: (request: Request, context: IdContext) => Promise<Response>;
  start: (request: Request) => Promise<Response>;
}
const api: RunApi = {
  list: listRuns,
  poll: pollRun,
  retry: retryRun,
  start: startRun,
};

const RunIdSchema = z.object({ runId: z.string() });
const DetailSchema = z.looseObject({
  run: z.looseObject({
    completedAt: z.string().nullable(),
    status: z.string(),
  }),
  samples: z.array(
    z.looseObject({
      elapsedMs: z.number().nullable(),
      id: z.string(),
      status: z.string(),
    })
  ),
});

// Exercise Next's real after()/waitUntil bridge, including response close.
const requestLifetime = () => {
  const pending: Promise<unknown>[] = [];
  const onClose: (() => void)[] = [];
  const errors: unknown[] = [];
  const request = new NextRequest("http://bench.test/api/runs");
  const work = createWorkStore({
    buildId: "test",
    deploymentId: "test",
    page: "/api/runs/route",
    previouslyRevalidatedTags: [],
    renderOpts: {
      cacheComponents: false,
      cacheLifeProfiles: { default: { expire: 300, revalidate: 60, stale: 0 } },
      experimental: { authInterrupts: false, useCacheTimeout: 60 },
      onAfterTaskError: (error) => {
        errors.push(error);
      },
      onClose: (listener) => {
        onClose.push(listener);
      },
      staticPageGenerationTimeout: 60,
      supportsDynamicResponse: true,
      validationLevel: "warning",
      waitUntil: (promise) => {
        pending.push(promise);
      },
    },
  });
  const requestOptions: Parameters<typeof createRequestStoreForAPI> = [
    request,
    { pathname: "/api/runs" },
    { expirationsByCacheKind: new Map(), tags: [] },
    undefined,
    undefined,
    undefined,
  ];
  const unit = createRequestStoreForAPI(...requestOptions);
  return {
    close: () => {
      for (const listener of onClose) {
        listener();
      }
    },
    errors,
    pending,
    run: <T>(handler: () => T) =>
      workAsyncStorage.run(work, () => workUnitAsyncStorage.run(unit, handler)),
  };
};

const poll = async (runId: string) => {
  const response = await api.poll(new Request("http://bench.test/api/runs"), {
    params: Promise.resolve({ id: runId }),
  });
  return DetailSchema.parse(await response.json());
};

const start = async (spec = SPEC) => {
  const lifetime = requestLifetime();
  const response = await lifetime.run(
    async () =>
      await api.start(
        new Request("http://bench.test/api/runs", {
          body: JSON.stringify(spec),
          method: "POST",
        })
      )
  );
  return { lifetime, response };
};

const finish = async (lifetime: ReturnType<typeof requestLifetime>) => {
  lifetime.close();
  await vi.runAllTimersAsync();
  await Promise.all(lifetime.pending);
  expect(lifetime.errors).toStrictEqual([]);
};

const retry = async (runId: string, sampleIds?: string[]) => {
  const lifetime = requestLifetime();
  const response = await lifetime.run(
    async () =>
      await api.retry(
        new Request(`http://bench.test/api/runs/${runId}/retry`, {
          body: JSON.stringify({ sampleIds }),
          method: "POST",
        }),
        { params: Promise.resolve({ id: runId }) }
      )
  );
  return { lifetime, response };
};

// Each fixture identity yields two successful and two failed Banana 2 samples.
const partialRun = async (identity: ReturnType<typeof randomUUID>) => {
  vi.mocked(randomUUID).mockReturnValueOnce(identity);
  const { lifetime, response } = await start({
    ...SPEC,
    models: ["banana2"],
    samplesPerModel: 4,
  });
  expect(response.status).toBe(201);
  const { runId } = RunIdSchema.parse(await response.json());
  await finish(lifetime);
  const detail = await poll(runId);
  expect(detail.run.status).toBe("partial");
  return { detail, runId };
};

describe("run API response lifetime", () => {
  beforeEach(() => {
    platform.hosted = false;
    vi.useFakeTimers();
    vi.stubGlobal("fetch", () => {
      throw new Error("Unexpected network request");
    });
  });

  afterEach(async () => {
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns a run id before dispatch and retains every serial sample through finalisation", async () => {
    const { lifetime, response } = await start();
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      201
    );
    const { runId } = RunIdSchema.parse(await response.json());
    await expect(poll(runId)).resolves.toMatchObject({
      run: { status: "running" },
      samples: [
        { elapsedMs: null, status: "pending" },
        { elapsedMs: null, status: "pending" },
      ],
    });
    expect(lifetime.pending.length).toBeGreaterThan(0);

    await finish(lifetime);

    const detail = await poll(runId);
    expect(
      detail.samples.length === 2 &&
        detail.samples.every((sample) =>
          ["completed", "failed"].includes(sample.status)
        )
    ).toBe(true);
    expect(
      detail.run.status !== "running" && detail.run.completedAt !== null
    ).toBe(true);
  });

  it.each([
    { models: ["banana2"], samplesPerModel: 4 },
    { models: ["gpt2"], samplesPerModel: 1 },
  ])(
    "rejects a hosted sweep beyond its execution budget before creating or dispatching it: %j",
    async (sweep) => {
      platform.hosted = true;
      const beforeResponse = await api.list();
      const before: unknown = await beforeResponse.json();
      const { lifetime, response } = await start({
        ...SPEC,
        ...sweep,
      });
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        code: "HOSTED_RUN_TOO_LONG",
      });
      const afterResponse = await api.list();
      await expect(afterResponse.json()).resolves.toStrictEqual(before);
      expect(lifetime.pending).toHaveLength(0);
    }
  );

  it("admits hosted samples that fit concurrently and completes them after the response", async () => {
    platform.hosted = true;
    const { lifetime, response } = await start({
      ...SPEC,
      concurrency: 4,
      models: ["banana2"],
      samplesPerModel: 4,
    });
    expect(response.status).toBe(201);
    const { runId } = RunIdSchema.parse(await response.json());
    await expect(poll(runId)).resolves.toMatchObject({
      run: { status: "running" },
    });
    expect(lifetime.pending.length).toBeGreaterThan(0);
    await finish(lifetime);
    const detail = await poll(runId);
    expect(detail.run.completedAt).not.toBeNull();
  });

  it("retains the entire retry pool and leaves successful samples unchanged", async () => {
    const { detail, runId } = await partialRun(
      "00000000-0000-4000-8000-000000000033"
    );
    const successful = detail.samples.filter(
      (sample) => sample.status === "completed"
    );
    const { lifetime, response } = await retry(runId);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ retried: 2 });
    await expect(poll(runId)).resolves.toMatchObject({
      run: { status: "running" },
    });
    expect(lifetime.pending.length).toBeGreaterThan(0);
    await finish(lifetime);
    const retried = await poll(runId);
    expect(
      retried.run.status === "partial" && retried.run.completedAt !== null
    ).toBe(true);
    expect(
      retried.samples.filter((sample) => sample.status === "completed")
    ).toStrictEqual(successful);
  });

  it("rejects an oversized hosted retry without resetting rows, but admits a selected sample", async () => {
    const { detail, runId } = await partialRun(
      "00000000-0000-4000-8000-000000000046"
    );
    platform.hosted = true;
    const rejected = await retry(runId);
    expect(rejected.response.status).toBe(409);
    await expect(rejected.response.json()).resolves.toMatchObject({
      code: "HOSTED_RUN_TOO_LONG",
    });
    expect(rejected.lifetime.pending).toHaveLength(0);
    await expect(poll(runId)).resolves.toStrictEqual(detail);

    const selectedIds = detail.samples
      .filter((sample) => sample.status === "failed")
      .slice(0, 1)
      .map((sample) => sample.id);
    const accepted = await retry(runId, selectedIds);
    expect(accepted.response.status).toBe(200);
    await expect(accepted.response.json()).resolves.toStrictEqual({
      retried: 1,
    });
    expect(accepted.lifetime.pending.length).toBeGreaterThan(0);
    await finish(accepted.lifetime);
    await expect(poll(runId)).resolves.toMatchObject({
      run: { status: "partial" },
    });
  });
});
