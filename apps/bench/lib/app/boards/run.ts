/**
 * Running a Board: one approved run as one Mastra workflow.
 *
 * Each node is a step. Every level of the graph is one `.parallel` block,
 * and the builder runs blocks in order, so a level waits for the one before
 * it; nodes that can run together (siblings fed by the same node) share a
 * block, and a level of one node is a block of one. A Compare node is a
 * nested workflow: it holds every Model's price in one reservation, then
 * drives each Model's run in `.parallel`, then keeps the Pick.
 *
 * The workflow holds no state of its own. Every fact a step depends on is in
 * the App's tables: the run and its approved prices in `app_board_runs`,
 * each node's results in `app_node_results`, each Generation and its hold in
 * the ledger. A step's provider call is keyed by the run, node and request,
 * so driving the same run again (after a function stopped, or a poll took
 * over) finds the Generation it already reserved instead of spending twice.
 *
 * Spending rules, on top of the ledger's own:
 *
 * - A step prices itself again on its real image before reserving, and
 *   refuses to hold more than the run approved for it.
 * - A failed step ends the run; nothing below it starts.
 * - Stop takes effect between steps. A call already sent to fal finishes
 *   and is counted, exactly as it would be on its own.
 */
import { createHash } from "node:crypto";

import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { AppSql } from "@motif/bench-db/app-sql";
import { z } from "zod";

import type { Member } from "../auth/members";
import { formatUsd } from "../money";
import { advanceGeneration } from "../tasks/execute";
import type { WorkerDeps, WorkerEvent } from "../tasks/execute";
import { startComparison, startRun } from "../tasks/start";
import type { StartResult } from "../tasks/start";
import { getOwnedGeneration } from "../tasks/store";
import type { Generation } from "../tasks/store";
import { NODE_LABELS, staleAfterPick } from "./model";
import { modelName } from "./names";
import { buildRequests, inputFor, pickSizes, quoteNode } from "./plan";
import { sayFor } from "./run-events";
import type { Say } from "./run-events";
import {
  approvedGraph,
  compareModelsOf,
  resultPick,
  StepFailedError,
} from "./run-inputs";
import { recordStream } from "./run-record";
import {
  claimRun,
  endRun,
  getOwnedRun,
  releaseRun,
  runStatus,
} from "./run-store";
import type { BoardRun, RunStep } from "./run-store";
import { typicalDurationMs } from "./run-timing";
import {
  armHomeLine,
  askingLine,
  compareHoldLine,
  Narrator,
  holdLine,
  pickLine,
  priceLine,
  readLine,
  settledLine,
  staleLine,
  typicalLine,
} from "./run-voice";
import type { Line } from "./run-voice";
import { sameConfiguration } from "./snapshot";
import { completeNode, getGraph, markStale, recordResult } from "./store";
import type { BoardNode } from "./store";

const IN_FLIGHT = new Set(["reserved", "submitting", "submitted"]);

/** How often a step looks at a Generation it is waiting for. */
const POLL_MS = 2000;

/** Leave this long before the host's limit so a run stops cleanly and a
 * poll can carry it on. */
const DRIVE_MS = 270_000;

export interface RunDeps {
  readonly worker: WorkerDeps;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
}

export const liveRunDeps = (worker: WorkerDeps): RunDeps => ({
  now: () => Date.now(),
  sleep: async (ms) => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },
  worker,
});

/** The run is out of time for this invocation; a poll carries it on. */
class OutOfTimeError extends Error {
  constructor() {
    super("Out of time for this invocation.");
    this.name = "OutOfTimeError";
  }
}

export interface RunContext {
  readonly sql: AppSql;
  readonly member: Member;
  readonly run: BoardRun;
  readonly deps: RunDeps;
  readonly deadline: number;
  /** How the run ended, noted where it happened rather than read back out
   * of the engine's error serialisation. */
  readonly outcome: { failure: string | null; outOfTime: boolean };
}

/** Note why a step stopped before the engine sees the throw. */
const guarded = async <T>(
  ctx: RunContext,
  work: () => Promise<T>
): Promise<T> => {
  try {
    return await work();
  } catch (error) {
    if (error instanceof OutOfTimeError) {
      ctx.outcome.outOfTime = true;
    } else if (error instanceof StepFailedError) {
      ctx.outcome.failure ??= error.message;
    }
    throw error;
  }
};

/** A stable request key for one request of one node in one run, shaped as
 * the UUID the Task schema asks for. The same run never reserves twice. */
export const stepKey = (
  runId: string,
  nodeId: string,
  index: number
): string => {
  const hex = createHash("sha256")
    .update(`${runId}:${nodeId}:${index}`)
    .digest("hex");
  // RFC 4122 variant: the high bits of this digit are 10, so it is 8, 9, a
  // or b, chosen by the digest.
  const variant = "89ab"[Number.parseInt(hex[16] ?? "0", 16) % 4] ?? "8";
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const started = (result: StartResult, label: string): readonly string[] => {
  if (result.kind === "refused") {
    throw new StepFailedError(`${label}: ${result.message}`);
  }
  return result.generationIds;
};

/** What this owner's history says the Model takes, as a line. The history is
 * a nicety: if it can't be read, nothing is said about duration and the run
 * goes on. */
const typicalFor = async (
  ctx: RunContext,
  model: string,
  name: string
): Promise<Line | null> => {
  try {
    const ms = await typicalDurationMs(ctx.sql, ctx.member.id, model);
    return ms === null ? null : typicalLine(name, ms);
  } catch (error) {
    console.error(
      `[board run] ${ctx.run.id} couldn't read ${model}'s history`,
      error
    );
    return null;
  }
};

/** Several lines, one after another and in order. */
const tellAll = async (
  say: Say,
  lines: readonly Line[],
  prefix = ""
): Promise<void> => {
  const [line, ...rest] = lines;
  if (line === undefined) {
    return;
  }
  await tell(say, line, prefix);
  await tellAll(say, rest, prefix);
};

const tell = async (
  say: Say,
  line: Line | null,
  prefix = ""
): Promise<void> => {
  if (line !== null) {
    await say(line.kind, `${prefix}${line.text}`, line.data);
  }
};

/**
 * Take a Generation to its end, or stop when this invocation's time runs
 * out. Any number of callers may do this at once; only a lease holder acts.
 * What it does on the way is said through `say`, each line led by `lead`
 * (a Compare names the Model whose line it is).
 */
const settle = async (
  ctx: RunContext,
  id: string,
  say: Say,
  lead = ""
): Promise<Generation> => {
  const first = await getOwnedGeneration(ctx.sql, ctx.member.id, id);
  if (first === null) {
    throw new StepFailedError("A run went missing.");
  }
  const name = modelName(first.model);
  if (first.status === "reserved") {
    // A Compare said every Model's hold together when it reserved them.
    if (lead === "") {
      await tell(say, holdLine(first.boundMicros));
    }
  } else if (IN_FLIGHT.has(first.status)) {
    await tell(
      say,
      { kind: "send", text: "Already with fal, picking it back up" },
      lead
    );
  }
  // The worker reports as it goes; each report is said before it moves on.
  const narrator = new Narrator({
    name,
    origin: first.submittedAt?.getTime() ?? ctx.deps.now(),
    typical: async () => await typicalFor(ctx, first.model, name),
  });
  const observe = async (event: WorkerEvent) => {
    await tellAll(say, await narrator.lines(event, ctx.deps.now()), lead);
  };
  for (;;) {
    await advanceGeneration(
      ctx.sql,
      ctx.member.id,
      id,
      ctx.deps.worker,
      observe
    );
    const generation = await getOwnedGeneration(ctx.sql, ctx.member.id, id);
    if (generation === null) {
      throw new StepFailedError("A run went missing.");
    }
    if (!IN_FLIGHT.has(generation.status)) {
      await tell(say, settledLine(generation), lead);
      return generation;
    }
    if (ctx.deps.now() >= ctx.deadline) {
      throw new OutOfTimeError();
    }
    await ctx.deps.sleep(POLL_MS);
  }
};

const loadNode = async (ctx: RunContext, nodeId: string) => {
  const graph = await approvedGraph(ctx);
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    throw new StepFailedError("A node in this run was removed.");
  }
  return { graph, node };
};

const stepOf = (ctx: RunContext, nodeId: string): RunStep => {
  const step = ctx.run.steps.find((candidate) => candidate.nodeId === nodeId);
  if (step === undefined) {
    throw new StepFailedError("That node isn't part of this run.");
  }
  return step;
};

/** Build the node's requests from what feeds it now, and check the price
 * against what the run approved for it. */
const prepare = async (ctx: RunContext, nodeId: string, say: Say) => {
  const { graph, node } = await loadNode(ctx, nodeId);
  const label = NODE_LABELS[node.kind];
  await tell(say, readLine(node, graph));
  const sizes = await pickSizes(ctx.sql, ctx.member.id, graph);
  const input = inputFor(node, graph, sizes);
  const built = buildRequests(node, input);
  if (!built.ok) {
    throw new StepFailedError(`${label}: ${built.reason}`);
  }
  const priced = quoteNode(node, input, ctx.member.id, sizes);
  if (!priced.ok) {
    throw new StepFailedError(`${label}: ${priced.reason}`);
  }
  const approved = stepOf(ctx, nodeId).micros;
  await tell(say, priceLine(priced.listMicros, priced.micros, approved));
  if (priced.micros > approved) {
    throw new StepFailedError(
      `${label} would hold ${formatUsd(priced.micros)} on its real image, more than the ${formatUsd(approved)} you approved, so it hasn't started.`
    );
  }
  return { graph, node, requests: built.requests };
};

/** A node ran: its first image is the Pick, and what it feeds is Stale
 * until it runs too. */
const finish = async (
  ctx: RunContext,
  node: BoardNode,
  graph: Awaited<ReturnType<typeof getGraph>>,
  generations: readonly Generation[],
  say: Say
) => {
  const pick = resultPick(node, generations);
  if (pick === undefined) {
    const failed = generations.find(
      (generation) => generation.status !== "completed"
    );
    throw new StepFailedError(
      `${NODE_LABELS[node.kind]} didn't finish: ${failed?.errorMessage ?? "no image came back."}`
    );
  }
  const current = await getGraph(ctx.sql, ctx.member.id, ctx.run.boardId);
  const snapshot = ctx.run.steps[0]?.snapshot;
  if (snapshot === undefined || !sameConfiguration(graph, current, node.id)) {
    // Keep the result in history, but never make pre-edit work the current Pick.
    await markStale(ctx.sql, ctx.member.id, [node.id]);
    return;
  }
  const original = snapshot.nodes.find((candidate) => candidate.id === node.id);
  const completed = await completeNode(
    ctx.sql,
    ctx.member.id,
    node.id,
    pick,
    original?.pickAssetId
  );
  if (!completed) {
    return;
  }
  await tell(say, pickLine());
  const below = staleAfterPick(
    node.id,
    graph.nodes.map((candidate) =>
      candidate.id === node.id ? { ...candidate, pickAssetId: pick } : candidate
    ),
    graph.wires
  );
  await markStale(ctx.sql, ctx.member.id, below);
  if (below.length > 0) {
    await tell(say, staleLine(below.length));
  }
};

const stopped = async (ctx: RunContext): Promise<boolean> =>
  (await runStatus(ctx.sql, ctx.member.id, ctx.run.id)) !== "running";

export const ReceiptSchema = z.object({
  generationIds: z.array(z.string()),
  nodeId: z.string(),
  status: z.enum(["done", "skipped"]),
});
type Receipt = z.infer<typeof ReceiptSchema>;

const skipped = (nodeId: string): Receipt => ({
  generationIds: [],
  nodeId,
  status: "skipped",
});

/** One Task node: reserve, run, settle, Pick. */
const runTaskNode = async (
  ctx: RunContext,
  nodeId: string,
  say: Say
): Promise<Receipt> => {
  if (await stopped(ctx)) {
    return skipped(nodeId);
  }
  const { graph, node, requests } = await prepare(ctx, nodeId, say);
  const [request] = requests;
  if (request === undefined) {
    throw new StepFailedError(`${NODE_LABELS[node.kind]} has nothing to run.`);
  }
  const ids = started(
    await startRun(ctx.sql, ctx.member, {
      ...request,
      idempotencyKey: stepKey(ctx.run.id, nodeId, 0),
    }),
    NODE_LABELS[node.kind]
  );
  await Promise.all(
    ids.map(async (id) => {
      await recordResult(ctx.sql, ctx.member.id, nodeId, id, ctx.run.id);
    })
  );
  const generations = await Promise.all(
    ids.map(async (id) => await settle(ctx, id, say))
  );
  await finish(ctx, node, graph, generations, say);
  return { generationIds: [...ids], nodeId, status: "done" };
};

const ReservedSchema = z.object({
  byModel: z.record(z.string(), z.string()),
  nodeId: z.string(),
  status: z.enum(["reserved", "skipped"]),
});
type Reserved = z.infer<typeof ReservedSchema>;

/** Compare, step one: hold every Model's price together, or none. */
const reserveCompare = async (
  ctx: RunContext,
  nodeId: string,
  say: Say
): Promise<Reserved> => {
  if (await stopped(ctx)) {
    return { byModel: {}, nodeId, status: "skipped" };
  }
  const { requests } = await prepare(ctx, nodeId, say);
  const first = requests[0];
  if (first?.task !== "generate") {
    throw new StepFailedError("Compare needs a Prompt.");
  }
  const models = requests.flatMap((request) =>
    request.model === undefined ? [] : [request.model]
  );
  const ids = started(
    await startComparison(ctx.sql, ctx.member, {
      idempotencyKey: stepKey(ctx.run.id, nodeId, 0),
      models,
      prompt: first.prompt,
      ...(first.aspect !== undefined && { aspect: first.aspect }),
      ...(first.look !== undefined && { look: first.look }),
      ...(first.mood !== undefined && { mood: first.mood }),
    }),
    "Compare"
  );
  await Promise.all(
    ids.map(async (id) => {
      await recordResult(ctx.sql, ctx.member.id, nodeId, id, ctx.run.id);
    })
  );
  const generations = await Promise.all(
    ids.map(async (id) => await getOwnedGeneration(ctx.sql, ctx.member.id, id))
  );
  const byModel: Record<string, string> = {};
  const holds: { name: string; micros: number }[] = [];
  for (const generation of generations) {
    if (generation !== null) {
      byModel[generation.model] = generation.id;
      holds.push({
        micros: generation.boundMicros,
        name: modelName(generation.model),
      });
    }
  }
  await tell(say, askingLine(holds.length));
  await tell(say, compareHoldLine(holds));
  return { byModel, nodeId, status: "reserved" };
};

const SettledSchema = z.object({
  generationId: z.string().nullable(),
  model: z.string(),
  ok: z.boolean(),
});

const safeId = (value: string): string =>
  value.replaceAll(/[^a-z0-9-]/giu, "-");

/** Compare as a nested workflow: reserve, then each Model in parallel, then
 * the Pick. */
const compareWorkflow = (
  ctx: RunContext,
  nodeId: string,
  models: readonly string[]
) => {
  const reserve = createStep({
    description: "Hold every Model's price for this Comparison together.",
    execute: async ({ writer }) =>
      await guarded(
        ctx,
        async () => await reserveCompare(ctx, nodeId, sayFor(writer, nodeId))
      ),
    id: `reserve-${nodeId}`,
    inputSchema: z.unknown(),
    outputSchema: ReservedSchema,
    retries: 0,
  });
  // The Models run side by side in this process, so the order they come home
  // in is read from one place.
  const home = { first: false };
  const arms = models.map((model) =>
    createStep({
      description: `Run ${model} for this Comparison.`,
      execute: async ({ inputData, writer }) => {
        const reserved = inputData[reserve.id];
        const id = reserved?.byModel[model];
        if (reserved?.status !== "reserved" || id === undefined) {
          return { generationId: null, model, ok: false };
        }
        const say = sayFor(writer, nodeId);
        const name = modelName(model);
        const generation = await guarded(
          ctx,
          async () => await settle(ctx, id, say, `${name}: `)
        );
        if (generation.status === "completed") {
          const wasFirst = !home.first;
          home.first = true;
          await tell(say, armHomeLine(name, generation.providerMs, wasFirst));
        }
        return {
          generationId: id,
          model,
          ok: generation.status === "completed",
        };
      },
      id: `model-${nodeId}-${safeId(model)}`,
      // The block before is the reservation alone, keyed by its step id.
      inputSchema: z.record(z.string(), ReservedSchema),
      outputSchema: SettledSchema,
      retries: 0,
    })
  );
  const collect = createStep({
    description: "Pick the first image that came back.",
    execute: async ({ inputData, writer }): Promise<Receipt> => {
      const say = sayFor(writer, nodeId);
      const ids = Object.values(inputData).flatMap((arm) =>
        arm.generationId === null ? [] : [arm.generationId]
      );
      if (ids.length === 0) {
        return skipped(nodeId);
      }
      return await guarded(ctx, async () => {
        const [{ graph, node }, found] = await Promise.all([
          loadNode(ctx, nodeId),
          Promise.all(
            ids.map(
              async (id) => await getOwnedGeneration(ctx.sql, ctx.member.id, id)
            )
          ),
        ]);
        const generations = found.filter(
          (generation): generation is Generation => generation !== null
        );
        await finish(ctx, node, graph, generations, say);
        return { generationIds: ids, nodeId, status: "done" } satisfies Receipt;
      });
    },
    id: `collect-${nodeId}`,
    // The block before is every Model's arm, keyed by its step id.
    inputSchema: z.record(z.string(), SettledSchema),
    outputSchema: ReceiptSchema,
    retries: 0,
  });
  return createWorkflow({
    description: "One prompt across several Models.",
    id: `compare-${nodeId}`,
    inputSchema: z.unknown(),
    outputSchema: z.record(z.string(), ReceiptSchema),
    retryConfig: { attempts: 0 },
  })
    .parallel([reserve])
    .parallel(arms)
    .parallel([collect])
    .commit();
};

const taskStep = (ctx: RunContext, nodeId: string) =>
  createStep({
    description: "Run one node: reserve its price, call fal, keep its Pick.",
    execute: async ({ writer }) =>
      await guarded(
        ctx,
        async () => await runTaskNode(ctx, nodeId, sayFor(writer, nodeId))
      ),
    id: `node-${nodeId}`,
    inputSchema: z.unknown(),
    outputSchema: ReceiptSchema,
    retries: 0,
  });

/**
 * The workflow for a run, built from its approved steps. Retries are off
 * throughout: every step spends, and a step's own keys make driving it again
 * safe, not a retry.
 */
export const buildRunWorkflow = (
  ctx: RunContext,
  compareModels: ReadonlyMap<string, readonly string[]>
) => {
  const levels: string[][] = [];
  for (const step of ctx.run.steps) {
    levels[step.level] = [...(levels[step.level] ?? []), step.nodeId];
  }
  const stepFor = (nodeId: string) => {
    const models = compareModels.get(nodeId);
    return models === undefined
      ? taskStep(ctx, nodeId)
      : compareWorkflow(ctx, nodeId, models);
  };
  let workflow = createWorkflow({
    description: "Run a node, or a node and everything below it, on a Board.",
    id: "board-run",
    inputSchema: z.unknown(),
    outputSchema: z.unknown(),
    retryConfig: { attempts: 0 },
  });
  for (const level of levels.filter((item) => item.length > 0)) {
    workflow = workflow.parallel(level.map((nodeId) => stepFor(nodeId)));
  }
  return workflow.commit();
};

/**
 * Drive a run as far as this invocation can. Safe to call from any number
 * of requests: only the holder of the run's lease drives it.
 */
export const driveRun = async (
  sql: AppSql,
  member: Member,
  runId: string,
  deps: RunDeps
): Promise<void> => {
  const lease = await claimRun(sql, member.id, runId);
  if (lease === null) {
    return;
  }
  try {
    const run = await getOwnedRun(sql, member.id, runId);
    if (run?.status !== "running") {
      return;
    }
    const ctx: RunContext = {
      deadline: deps.now() + DRIVE_MS,
      deps,
      member,
      outcome: { failure: null, outOfTime: false },
      run,
      sql,
    };
    const workflow = buildRunWorkflow(ctx, compareModelsOf(run));
    // The App's own run id names the Mastra run, so logs and the stream
    // correlate with app_board_runs and app_run_events.
    const handle = await workflow.createRun({
      resourceId: member.id,
      runId,
    });
    const stream = handle.stream({ inputData: { runId } });
    await recordStream(
      {
        now: ctx.deps.now,
        outcome: ctx.outcome,
        ownerId: member.id,
        runId: ctx.run.id,
        sql,
      },
      stream.fullStream
    );
    const result = await stream.result;
    if (result.status === "success") {
      if (await stopped(ctx)) {
        return;
      }
      await endRun(sql, member.id, runId, "completed");
      return;
    }
    if (ctx.outcome.outOfTime && ctx.outcome.failure === null) {
      return;
    }
    await endRun(
      sql,
      member.id,
      runId,
      "failed",
      ctx.outcome.failure ??
        "The run stopped unexpectedly. Nothing more will start."
    );
  } finally {
    await releaseRun(sql, runId, lease);
  }
};
