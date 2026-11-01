import { MotifError, err, ok } from "@howells/motif-sdk";
import type {
  MotifClient,
  TaskInput,
  TaskOutput,
  TaskPlan,
} from "@howells/motif-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Asset } from "../media/assets";
import { advanceGeneration } from "./execute";
import type { WorkerDeps, WorkerEvent } from "./execute";
import * as store from "./store";
import type { Ending, Generation } from "./store";

vi.mock("./store", () => ({
  claimLease: vi.fn(),
  endGeneration: vi.fn(),
  findProducer: vi.fn(),
  getOwnedGeneration: vi.fn(),
  markSubmitting: vi.fn(),
  recordSubmitted: vi.fn(),
  releaseLease: vi.fn(),
}));
vi.mock("../media/assets", () => ({
  assetDataUrl: vi.fn(),
  getOwnedAssets: async () => [],
  storeAsset: vi.fn(),
}));

const OWNER = `mem_${"a".repeat(32)}`;
const ID = `gen_${"b".repeat(32)}`;
const LEASE = "2026-10-01 00:05:30.123456+00";
const sql = vi.fn(async () => []);

const generation = (overrides: Partial<Generation> = {}): Generation => ({
  boundMicros: 221_250,
  comparisonId: null,
  completedAt: null,
  costBasis: null,
  costMicros: null,
  costStatus: "held",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  data: {},
  endpoint: "fal-ai/banana2",
  errorCode: null,
  errorMessage: null,
  holdId: `hld_${"c".repeat(32)}`,
  id: ID,
  input: {
    count: 1,
    idempotencyKey: "6a4f1b9e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
    model: "banana2",
    prompt: "A chair by a window",
    referenceAssetIds: [],
    task: "generate",
  },
  leaseUntil: null,
  maskAssetId: null,
  mode: null,
  model: "banana2",
  outputAssetIds: [],
  ownerId: OWNER,
  parentId: null,
  prompt: "A chair by a window",
  providerMs: null,
  referenceAssetIds: [],
  requestId: null,
  retryOf: null,
  sourceAssetId: null,
  stackId: ID,
  status: "reserved",
  submittedAt: null,
  task: "generate",
  tier: "balanced",
  ...overrides,
});

const plan = (overrides: Partial<TaskPlan> = {}): TaskPlan => ({
  body: { num_images: 1, prompt: "A chair by a window" },
  chosenBy: "pin",
  cost: { basis: "projected", usd: 0.15 },
  endpoint: "fal-ai/banana2",
  model: "banana2",
  provider: "fal",
  queued: true,
  task: "generate",
  tier: "balanced",
  ...overrides,
});

const output = (overrides: Partial<TaskOutput> = {}): TaskOutput => ({
  chosenBy: "pin",
  cost: { basis: "projected", usd: 0.25 + 1e-7 },
  data: {},
  endpoint: "fal-ai/banana2",
  files: [{ key: "images", url: "https://v3.fal.media/files/out.png" }],
  model: "banana2",
  provider: "fal",
  raw: {},
  task: "generate",
  tier: "balanced",
  ...overrides,
});

// One real 16×16 PNG, so the worker's own output inspection runs for real.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGklEQVR4nGP4z8DAwMDAxMDAwMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
  "base64"
);

const storeFake: WorkerDeps["store"] = async (_sql, input): Promise<Asset> => ({
  blobPathname: "app/x.png",
  bytes: input.bytes.byteLength,
  contentType: input.contentType,
  createdAt: new Date(),
  height: input.height,
  id: `ast_${"d".repeat(32)}`,
  kind: input.kind,
  ownerId: input.ownerId,
  width: input.width,
});

type RunBehaviour = (
  task: string,
  input: TaskInput
) => ReturnType<MotifClient["run"]>;

const depsWith = (
  run: RunBehaviour,
  options: { plan?: TaskPlan; resume?: MotifClient["resume"] } = {}
) => {
  const runSpy = vi.fn(run);
  const resumeSpy = vi.fn(options.resume ?? (async () => ok(output())));
  const deps: WorkerDeps = {
    client: {
      plan: () => ok(options.plan ?? plan()),
      resume: resumeSpy,
      run: runSpy,
    },
    dataUrl: async () => "data:image/png;base64,",
    download: vi.fn(async () => new Uint8Array(PNG)),
    now: () => Date.parse("2026-10-01T00:00:10Z"),
    store: vi.fn(storeFake),
  };
  return { deps, resumeSpy, runSpy };
};

const endings = (): { from: readonly string[]; ending: Ending }[] =>
  vi
    .mocked(store.endGeneration)
    .mock.calls.map((call) => ({ ending: call[3], from: call[2] }));

describe("advanceGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.claimLease).mockResolvedValue(LEASE);
    vi.mocked(store.markSubmitting).mockResolvedValue(true);
    vi.mocked(store.endGeneration).mockResolvedValue(true);
    vi.mocked(store.getOwnedGeneration).mockResolvedValue(generation());
  });

  it("does nothing without the lease", async () => {
    vi.mocked(store.claimLease).mockResolvedValue(null);
    const { deps, runSpy } = depsWith(async () => ok(output()));
    await advanceGeneration(sql, OWNER, ID, deps);
    expect(runSpy).not.toHaveBeenCalled();
    expect(store.releaseLease).not.toHaveBeenCalled();
  });

  it("never sends a run another worker has already moved to submitting", async () => {
    vi.mocked(store.markSubmitting).mockResolvedValue(false);
    const { deps, runSpy } = depsWith(async () => ok(output()));
    await advanceGeneration(sql, OWNER, ID, deps);
    expect(runSpy).not.toHaveBeenCalled();
    expect(store.releaseLease).toHaveBeenCalledWith(sql, ID, LEASE);
  });

  it("releases the hold without calling fal when Motif would now pick another Model", async () => {
    const { deps, runSpy } = depsWith(async () => ok(output()), {
      plan: plan({ endpoint: "fal-ai/other", model: "seedream5" }),
    });
    await advanceGeneration(sql, OWNER, ID, deps);
    expect(runSpy).not.toHaveBeenCalled();
    expect(endings()).toMatchObject([
      {
        ending: { cost: { kind: "released" }, errorCode: "PLAN_CHANGED" },
        from: ["reserved"],
      },
    ]);
  });

  it("releases the hold without calling fal when the real request could cost more than was held", async () => {
    const { deps, runSpy } = depsWith(async () => ok(output()), {
      plan: plan({ body: { num_images: 4, prompt: "A chair" } }),
    });
    await advanceGeneration(sql, OWNER, ID, deps);
    expect(runSpy).not.toHaveBeenCalled();
    expect(endings()).toMatchObject([
      { ending: { cost: { kind: "released" }, errorCode: "BOUND_CHANGED" } },
    ]);
  });

  it("releases the hold when fal refuses the request before accepting it", async () => {
    const { deps } = depsWith(async () =>
      err(new MotifError("Unprocessable", 422))
    );
    await advanceGeneration(sql, OWNER, ID, deps);
    expect(endings()).toMatchObject([
      {
        ending: { cost: { kind: "released" }, status: "failed" },
        from: ["submitting"],
      },
    ]);
  });

  it("keeps the whole hold when the send fails in a way fal may have accepted", async () => {
    const { deps } = depsWith(async () =>
      err(new MotifError("socket hang up", 0))
    );
    await advanceGeneration(sql, OWNER, ID, deps);
    expect(endings()).toMatchObject([
      {
        ending: {
          cost: { kind: "retained" },
          errorCode: "SUBMISSION_UNCONFIRMED",
          status: "unknown",
        },
      },
    ]);
  });

  it("leaves an accepted run submitted, for the next worker to resume, when waiting times out", async () => {
    const { deps } = depsWith(async (_task, input) => {
      input.onSubmitted?.("req-123");
      return err(new MotifError("Queued run timed out", 504));
    });
    await advanceGeneration(sql, OWNER, ID, deps);
    expect(store.recordSubmitted).toHaveBeenCalledWith(
      sql,
      ID,
      "req-123",
      LEASE
    );
    expect(store.endGeneration).not.toHaveBeenCalled();
  });

  it("keeps the whole hold when an accepted run fails, even with a refusal status", async () => {
    const { deps } = depsWith(async (_task, input) => {
      input.onSubmitted?.("req-123");
      return err(new MotifError("Bad output", 422));
    });
    await advanceGeneration(sql, OWNER, ID, deps);
    expect(endings()).toMatchObject([
      { ending: { cost: { kind: "retained" }, status: "failed" } },
    ]);
  });

  it("never resends a run whose worker stopped mid-send", async () => {
    vi.mocked(store.getOwnedGeneration).mockResolvedValue(
      generation({ status: "submitting" })
    );
    const { deps, runSpy, resumeSpy } = depsWith(async () => ok(output()));
    await advanceGeneration(sql, OWNER, ID, deps);
    expect(runSpy).not.toHaveBeenCalled();
    expect(resumeSpy).not.toHaveBeenCalled();
    expect(endings()).toMatchObject([
      { ending: { cost: { kind: "retained" }, status: "unknown" } },
    ]);
  });

  it("resumes a submitted run by its request id instead of sending it again", async () => {
    vi.mocked(store.getOwnedGeneration).mockResolvedValue(
      generation({
        requestId: "req-9",
        status: "submitted",
        submittedAt: new Date("2026-10-01T00:00:00Z"),
      })
    );
    const { deps, runSpy, resumeSpy } = depsWith(async () => ok(output()));
    await advanceGeneration(sql, OWNER, ID, deps);
    expect(runSpy).not.toHaveBeenCalled();
    expect(resumeSpy).toHaveBeenCalledWith(
      "generate",
      expect.anything(),
      "req-9"
    );
    expect(endings()).toMatchObject([
      {
        ending: {
          cost: { kind: "settled", micros: 250_001 },
          providerMs: 10_000,
          status: "completed",
        },
      },
    ]);
  });

  it("stores the image and settles the SDK's cost, rounded up to the micro", async () => {
    const { deps } = depsWith(async (_task, input) => {
      input.onSubmitted?.("req-1");
      return ok(output());
    });
    await advanceGeneration(sql, OWNER, ID, deps);
    expect(store.claimLease).toHaveBeenCalledWith(sql, ID, OWNER);
    expect(store.markSubmitting).toHaveBeenCalledWith(sql, ID, LEASE);
    expect(store.recordSubmitted).toHaveBeenCalledWith(sql, ID, "req-1", LEASE);
    expect(store.endGeneration).toHaveBeenCalledWith(
      sql,
      ID,
      expect.any(Array),
      expect.any(Object),
      LEASE
    );
    expect(store.releaseLease).toHaveBeenCalledWith(sql, ID, LEASE);
    expect(deps.download).toHaveBeenCalledWith(
      "https://v3.fal.media/files/out.png"
    );
    expect(endings()).toMatchObject([
      {
        ending: {
          cost: { kind: "settled", micros: 250_001 },
          outputAssetIds: [`ast_${"d".repeat(32)}`],
          status: "completed",
        },
      },
    ]);
  });

  it("tells an observer what it is doing, separating a change in fal's queue from a poll that found none", async () => {
    const { deps } = depsWith(async (_task, input) => {
      input.onSubmitted?.("req-1");
      input.onProgress?.("queued", 3);
      input.onProgress?.("queued", 3);
      input.onProgress?.("queued", 1);
      input.onProgress?.("processing");
      input.onProgress?.("processing");
      input.onProgress?.("completed");
      return ok(output());
    });
    const seen: WorkerEvent[] = [];
    await advanceGeneration(sql, OWNER, ID, deps, async (event) => {
      await Promise.resolve();
      seen.push(event);
    });
    expect(seen).toEqual([
      { kind: "sending" },
      { kind: "accepted", requestId: "req-1" },
      { kind: "queue", queuePosition: 3, status: "queued" },
      { kind: "polled", queuePosition: 3, status: "queued" },
      { kind: "queue", queuePosition: 1, status: "queued" },
      { kind: "queue", queuePosition: undefined, status: "processing" },
      { kind: "polled", queuePosition: undefined, status: "processing" },
      { kind: "queue", queuePosition: undefined, status: "completed" },
      { count: 1, kind: "downloading" },
      {
        bytes: PNG.byteLength,
        count: 1,
        height: 16,
        kind: "stored",
        width: 16,
      },
    ]);
  });

  it("passes on the log lines fal wrote, trimmed and without blanks", async () => {
    const { deps } = depsWith(async (_task, input) => {
      input.onSubmitted?.("req-1");
      input.onProgress?.("processing", undefined, [
        { message: "  loading weights ", timestamp: "t" },
        { message: "   ", timestamp: "t" },
        { message: "denoising", timestamp: "t" },
      ]);
      return ok(output());
    });
    const seen: WorkerEvent[] = [];
    await advanceGeneration(sql, OWNER, ID, deps, (event) => {
      seen.push(event);
    });
    expect(seen).toContainEqual({
      kind: "logs",
      lines: ["loading weights", "denoising"],
    });
  });

  it("reports the queue while it resumes a run fal already has", async () => {
    vi.mocked(store.getOwnedGeneration).mockResolvedValue(
      generation({ requestId: "req-9", status: "submitted" })
    );
    const { deps } = depsWith(async () => ok(output()), {
      resume: async (_task, input) => {
        input.onProgress?.("processing");
        return ok(output());
      },
    });
    const seen: WorkerEvent[] = [];
    await advanceGeneration(sql, OWNER, ID, deps, (event) => {
      seen.push(event);
    });
    expect(seen.map((event) => event.kind)).toEqual([
      "queue",
      "downloading",
      "stored",
    ]);
  });

  it("finishes the Generation when its observer throws, since the observer only narrates", async () => {
    const { deps } = depsWith(async (_task, input) => {
      input.onSubmitted?.("req-1");
      return ok(output());
    });
    await expect(
      advanceGeneration(sql, OWNER, ID, deps, () => {
        throw new Error("the feed closed");
      })
    ).resolves.toBeUndefined();
    expect(store.endGeneration).toHaveBeenCalledWith(
      sql,
      ID,
      expect.any(Array),
      expect.objectContaining({ status: "completed" }),
      LEASE
    );
    expect(store.releaseLease).toHaveBeenCalledWith(sql, ID, LEASE);
  });

  it("keeps the whole hold when fal returns no price", async () => {
    const { deps } = depsWith(async (_task, input) => {
      input.onSubmitted?.("req-1");
      return ok(output({ cost: { basis: "unknown", usd: null } }));
    });
    await advanceGeneration(sql, OWNER, ID, deps);
    expect(endings()).toMatchObject([
      { ending: { cost: { kind: "retained" }, status: "completed" } },
    ]);
  });

  it("ends the run, keeping the hold, when the result can never be kept", async () => {
    const { deps } = depsWith(async (_task, input) => {
      input.onSubmitted?.("req-1");
      return ok(output());
    });
    const notAnImage: WorkerDeps = {
      ...deps,
      download: async () => new TextEncoder().encode("<html>"),
    };
    await advanceGeneration(sql, OWNER, ID, notAnImage);
    expect(endings()).toMatchObject([
      {
        ending: {
          cost: { kind: "retained" },
          errorCode: "NOT_AN_IMAGE",
          status: "failed",
        },
      },
    ]);
  });

  it("leaves a run to resume when its download drops", async () => {
    const { deps } = depsWith(async (_task, input) => {
      input.onSubmitted?.("req-1");
      return ok(output());
    });
    const dropped: WorkerDeps = {
      ...deps,
      download: async () => {
        throw new TypeError("fetch failed");
      },
    };
    await expect(advanceGeneration(sql, OWNER, ID, dropped)).rejects.toThrow(
      "fetch failed"
    );
    expect(store.endGeneration).not.toHaveBeenCalled();
    expect(store.releaseLease).toHaveBeenCalledWith(sql, ID, LEASE);
  });
});
