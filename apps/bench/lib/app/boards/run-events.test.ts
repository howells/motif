import { createStep, createWorkflow } from "@mastra/core/workflows";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { RunEventGate, RunEventSchema, eventsOf, sayFor } from "./run-events";
import type { RunEventInput, RunOutcome } from "./run-events";

const NODE_A = `nod_${"a".repeat(32)}`;
const NODE_B = `nod_${"b".repeat(32)}`;
const CALM: RunOutcome = { failure: null, outOfTime: false };

/** A tiny real workflow shaped like a Board run: a Task node and a Compare
 * (a nested workflow of reserve, two arms and collect) in one level. */
const tinyRun = (options: { failArm?: boolean } = {}) => {
  const task = createStep({
    execute: async ({ writer }) => {
      await sayFor(writer, NODE_A)("read", "Reading the Prompt");
      await sayFor(writer, NODE_A)("price", "Pricing again");
      return { nodeId: NODE_A, status: "done" };
    },
    id: `node-${NODE_A}`,
    inputSchema: z.unknown(),
    outputSchema: z.object({ nodeId: z.string(), status: z.string() }),
    retries: 0,
  });
  const reserve = createStep({
    execute: async ({ writer }) => {
      await sayFor(writer, NODE_B)("hold", "Holding both together");
      return { held: true };
    },
    id: `reserve-${NODE_B}`,
    inputSchema: z.unknown(),
    outputSchema: z.object({ held: z.boolean() }),
    retries: 0,
  });
  const arm = (model: string) =>
    createStep({
      execute: async ({ writer }) => {
        if (options.failArm === true && model === "b") {
          throw new Error("Compare didn't finish: fal said no.");
        }
        await sayFor(writer, NODE_B)("arm", `${model} came back`);
        return { ok: true };
      },
      id: `model-${NODE_B}-${model}`,
      inputSchema: z.record(z.string(), z.object({ held: z.boolean() })),
      outputSchema: z.object({ ok: z.boolean() }),
      retries: 0,
    });
  const collect = createStep({
    execute: async ({ writer }) => {
      await sayFor(writer, NODE_B)("pick", "Kept as the Pick");
      return { nodeId: NODE_B, status: "done" };
    },
    id: `collect-${NODE_B}`,
    inputSchema: z.record(z.string(), z.object({ ok: z.boolean() })),
    outputSchema: z.object({ nodeId: z.string(), status: z.string() }),
    retries: 0,
  });
  const compare = createWorkflow({
    id: `compare-${NODE_B}`,
    inputSchema: z.unknown(),
    outputSchema: z.record(z.string(), z.unknown()),
    retryConfig: { attempts: 0 },
  })
    .parallel([reserve])
    .parallel([arm("a"), arm("b")])
    .parallel([collect])
    .commit();
  return createWorkflow({
    id: "board-run",
    inputSchema: z.unknown(),
    outputSchema: z.unknown(),
    retryConfig: { attempts: 0 },
  })
    .parallel([task, compare])
    .commit();
};

const streamed = async (options: { failArm?: boolean } = {}) => {
  const run = await tinyRun(options).createRun();
  const stream = run.stream({ inputData: { runId: "r" } });
  const chunks: unknown[] = [];
  for await (const chunk of stream.fullStream) {
    chunks.push(chunk);
  }
  return { chunks, result: await stream.result };
};

const allEvents = (chunks: readonly unknown[], outcome = CALM) =>
  chunks.flatMap((chunk) => eventsOf(chunk, outcome));

describe("a Board run's stream", () => {
  it("carries a Compare's nested step beats in the parent stream, each with its own node", async () => {
    const { chunks, result } = await streamed();
    expect(result.status).toBe("success");
    const outputs = chunks.flatMap((chunk) =>
      typeof chunk === "object" &&
      chunk !== null &&
      "type" in chunk &&
      chunk.type === "workflow-step-output"
        ? [chunk]
        : []
    );
    // Four beats from the Compare's four steps, two from the Task node.
    expect(outputs).toHaveLength(6);
    const events = allEvents(chunks);
    const mine = (nodeId: string, kind: string) =>
      events.filter((event) => event.nodeId === nodeId && event.kind === kind);
    expect(mine(NODE_B, "hold")).toHaveLength(1);
    expect(
      mine(NODE_B, "arm")
        .map((event) => event.text)
        .toSorted()
    ).toEqual(["a came back", "b came back"]);
    expect(mine(NODE_B, "pick")).toHaveLength(1);
    expect(mine(NODE_A, "read")).toHaveLength(1);
  });

  it("starts and ends each node on its own step, and the run on its own chunks", async () => {
    const { chunks } = await streamed();
    const events = allEvents(chunks);
    expect(events[0]).toEqual({
      kind: "run",
      nodeId: null,
      text: "Starting the run",
    });
    expect(events.at(-1)).toEqual({
      kind: "end",
      nodeId: null,
      text: "The run is complete",
    });
    for (const nodeId of [NODE_A, NODE_B]) {
      const own = events.filter((event) => event.nodeId === nodeId);
      expect(own[0]?.kind).toBe("begin");
      expect(own.at(-1)?.kind).toBe("done");
    }
    // The Compare's inner steps are not begun or finished as nodes.
    expect(events.filter((event) => event.kind === "begin")).toHaveLength(2);
  });

  it("says a failed arm's own words once, for the Compare's node", async () => {
    const outcome: RunOutcome = {
      failure: "Compare didn't finish: fal said no.",
      outOfTime: false,
    };
    const { chunks, result } = await streamed({ failArm: true });
    expect(result.status).toBe("failed");
    const errors = new RunEventGate(() => 0);
    const kept = allEvents(chunks, outcome).flatMap((event) => {
      const accepted = errors.accept(event);
      return accepted === null ? [] : [accepted];
    });
    const failures = kept.filter((event) => event.kind === "error");
    expect(failures).toEqual([
      {
        kind: "error",
        nodeId: NODE_B,
        text: "Compare didn't finish: fal said no.",
      },
    ]);
    expect(kept.at(-1)?.text).toBe(
      "The run stopped, and nothing more will start"
    );
  });

  it("reads a failure's text from the engine when the step noted none", async () => {
    const { chunks } = await streamed({ failArm: true });
    const failure = allEvents(chunks).find((event) => event.kind === "error");
    expect(failure?.text).toBe("Compare didn't finish: fal said no.");
  });

  it("says a run out of time is carrying on, not that it failed", async () => {
    const { chunks } = await streamed({ failArm: true });
    const events = allEvents(chunks, { failure: null, outOfTime: true });
    expect(events.some((event) => event.kind === "error")).toBe(false);
    expect(events.at(-1)?.text).toBe(
      "Out of time for now. The run carries on shortly."
    );
  });
});

describe("eventsOf", () => {
  it("ignores chunks it has no use for and beats that break the schema", () => {
    expect(
      eventsOf({ payload: {}, type: "workflow-step-progress" }, CALM)
    ).toEqual([]);
    expect(eventsOf("nonsense", CALM)).toEqual([]);
    expect(
      eventsOf(
        {
          payload: { output: { kind: "nope", nodeId: null, text: "x" } },
          type: "workflow-step-output",
        },
        CALM
      )
    ).toEqual([]);
    expect(
      eventsOf(
        {
          payload: { id: "something-else", status: "success" },
          type: "workflow-step-result",
        },
        CALM
      )
    ).toEqual([]);
  });

  it("says a node the stop skipped will not start", () => {
    expect(
      eventsOf(
        {
          payload: {
            id: `node-${NODE_A}`,
            output: { nodeId: NODE_A, status: "skipped" },
            status: "success",
          },
          type: "workflow-step-result",
        },
        CALM
      )
    ).toEqual([
      {
        kind: "done",
        nodeId: NODE_A,
        text: "Stopped. Nothing below will start",
      },
    ]);
  });
});

describe("sayFor", () => {
  it("writes the checked beat, awaiting the writer", async () => {
    const written: unknown[] = [];
    await sayFor(
      {
        write: async (chunk) => {
          await Promise.resolve();
          written.push(chunk);
        },
      },
      NODE_A
    )("price", "Pricing again", { micros: 70_000 });
    expect(written).toEqual([
      {
        data: { micros: 70_000 },
        kind: "price",
        nodeId: NODE_A,
        text: "Pricing again",
      },
    ]);
  });

  it("refuses an empty beat where it is made", async () => {
    await expect(
      sayFor(
        {
          write: async () => {
            await Promise.resolve();
          },
        },
        NODE_A
      )("read", "")
    ).rejects.toThrow("Too small");
  });

  it("is the same schema the stream is read with", () => {
    expect(
      RunEventSchema.safeParse({
        kind: "read",
        nodeId: null,
        text: "x",
        extra: 1,
      }).success
    ).toBe(false);
  });
});

describe("RunEventGate", () => {
  const event = (overrides: Partial<RunEventInput>): RunEventInput => ({
    kind: "read",
    nodeId: NODE_A,
    text: "Reading the Prompt",
    ...overrides,
  });

  it("drops a repeat of a node's last beat but not another node's", () => {
    const gate = new RunEventGate(() => 0);
    expect(gate.accept(event({}))).not.toBeNull();
    expect(gate.accept(event({}))).toBeNull();
    expect(gate.accept(event({ nodeId: NODE_B }))).not.toBeNull();
    expect(gate.accept(event({ text: "Reading the Look" }))).not.toBeNull();
    expect(gate.accept(event({}))).not.toBeNull();
  });

  it("spaces out a fast-changing queue position, with time injected", () => {
    let now = 0;
    const gate = new RunEventGate(() => now);
    const queue = (ahead: number) =>
      gate.accept(
        event({ kind: "queue", text: `In the queue, ${ahead} ahead` })
      );
    expect(queue(5)).not.toBeNull();
    now = 300;
    expect(queue(4)).toBeNull();
    now = 800;
    expect(queue(3)).not.toBeNull();
    expect(
      gate.accept(event({ kind: "make", text: "fal is making it" }))
    ).not.toBeNull();
  });

  it("cuts long text and drops oversized data", () => {
    const gate = new RunEventGate(() => 0);
    const kept = gate.accept(
      event({ data: { blob: "x".repeat(2000) }, text: "y".repeat(500) })
    );
    expect(kept?.text).toHaveLength(240);
    expect(kept?.text.endsWith("…")).toBe(true);
    expect(kept?.data).toBeUndefined();
  });

  it("drops a beat with nothing to say", () => {
    expect(new RunEventGate(() => 0).accept(event({ text: "   " }))).toBeNull();
  });
});
