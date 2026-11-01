/**
 * What a Board run says while it works.
 *
 * Steps only emit: each beat is a typed payload handed to Mastra's `writer`,
 * so it travels in the workflow's own stream. `driveRun` is the one place
 * that turns that stream into stored rows, through `eventsOf` (Mastra's
 * chunks to beats) and `RunEventGate` (bounds, throttling, repeats). The
 * canvas reads the rows back over the events route. Pure and safe in the
 * browser: nothing here touches the database.
 */
import { z } from "zod";

/** Closed vocabulary of beats, so the canvas can label and weigh each. */
export const RUN_EVENT_KINDS = [
  "run",
  "begin",
  "read",
  "price",
  "hold",
  "send",
  "queue",
  "make",
  "wait",
  "log",
  "image",
  "store",
  "settle",
  "pick",
  "stale",
  "compare",
  "arm",
  "done",
  "error",
  "end",
] as const;

export type RunEventKind = (typeof RUN_EVENT_KINDS)[number];

/** Facts that ride with a beat: small, flat and printable. */
export const RunEventDataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
);

/** The one shape of a beat, as a step emits it and the table keeps it. */
export const RunEventSchema = z.strictObject({
  data: RunEventDataSchema.optional(),
  kind: z.enum(RUN_EVENT_KINDS),
  nodeId: z.string().nullable(),
  text: z.string().min(1),
});

export type RunEventInput = z.infer<typeof RunEventSchema>;
export type RunEventData = z.infer<typeof RunEventDataSchema>;

/** Where a step writes beats: Mastra's `writer`, seen through the one method
 * used. Every call must be awaited. */
export interface BeatWriter {
  readonly write: (chunk: unknown) => Promise<unknown>;
}

/** Say one beat about the node a step is working on. */
export type Say = (
  kind: RunEventKind,
  text: string,
  data?: RunEventData
) => Promise<void>;

/** A `Say` for one node over a step's writer. The beat is checked against the
 * schema before it is written, so a malformed one fails where it was made. */
export const sayFor =
  (writer: BeatWriter, nodeId: string | null): Say =>
  async (kind, text, data) => {
    const beat = RunEventSchema.parse({
      kind,
      nodeId,
      text,
      ...(data !== undefined && { data }),
    });
    await writer.write(beat);
  };

/** A `Say` that goes nowhere, for a caller with no stream to write to. */
export const silent: Say = async () => {
  await Promise.resolve();
};

// ── From Mastra's stream to beats ───────────────────────────────────────

const ChunkSchema = z.object({ payload: z.unknown(), type: z.string() });

const StepPayloadSchema = z.object({
  error: z.unknown().optional(),
  id: z.string(),
  output: z.unknown().optional(),
  status: z.string().optional(),
});

const OutputPayloadSchema = z.object({ output: z.unknown() });

const FinishPayloadSchema = z.object({ workflowStatus: z.string() });

const StepOutcomeSchema = z.object({ status: z.string() });

/** `node-nod_x`, `compare-nod_x` or one of the steps inside a Compare: the
 * node the step belongs to, and whether it is the node's own step. */
const STEP_ID = /^(?:node|compare)-(nod_[0-9a-f]{32})(\..+)?$/u;

const stepOwner = (
  id: string
): { readonly nodeId: string; readonly own: boolean } | null => {
  const found = STEP_ID.exec(id);
  const nodeId = found?.[1];
  return nodeId === undefined
    ? null
    : { nodeId, own: found?.[2] === undefined };
};

/** The readable text of a failure, whatever shape the engine serialised it
 * in. */
export const failureText = (error: unknown): string => {
  if (typeof error === "string" && error !== "") {
    return error;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error;
    if (typeof message === "string" && message !== "") {
      return message;
    }
  }
  return "The step failed.";
};

/** How the run ended, noted by the steps where it happened. */
export interface RunOutcome {
  readonly failure: string | null;
  readonly outOfTime: boolean;
}

const STOPPED_TEXT = "Out of time for now. The run carries on shortly.";

const stepEvents = (
  chunkType: string,
  payload: unknown,
  outcome: RunOutcome
): RunEventInput[] => {
  const step = StepPayloadSchema.safeParse(payload);
  if (!step.success) {
    return [];
  }
  const owner = stepOwner(step.data.id);
  if (owner === null) {
    return [];
  }
  const { nodeId } = owner;
  if (chunkType === "workflow-step-start") {
    return owner.own ? [{ kind: "begin", nodeId, text: "Starting" }] : [];
  }
  if (step.data.status === "failed") {
    return [
      outcome.outOfTime && outcome.failure === null
        ? { kind: "run", nodeId, text: STOPPED_TEXT }
        : {
            kind: "error",
            nodeId,
            text: outcome.failure ?? failureText(step.data.error),
          },
    ];
  }
  if (step.data.status === "success" && owner.own) {
    const outcomeRead = StepOutcomeSchema.safeParse(step.data.output);
    const skipped =
      outcomeRead.success && outcomeRead.data.status === "skipped";
    return [
      {
        kind: "done",
        nodeId,
        text: skipped ? "Stopped. Nothing below will start" : "Finished",
      },
    ];
  }
  return [];
};

/**
 * The beats one chunk of a workflow's stream stands for: the run starting and
 * finishing, a node's step beginning and ending, a step's failure, and each
 * beat a step wrote with `writer`. A nested Compare surfaces in the parent
 * stream like any other step; its own beats carry their node, so nothing
 * depends on the step ids.
 */
export const eventsOf = (
  chunk: unknown,
  outcome: RunOutcome
): RunEventInput[] => {
  const read = ChunkSchema.safeParse(chunk);
  if (!read.success) {
    return [];
  }
  const { payload, type } = read.data;
  switch (type) {
    case "workflow-start": {
      return [{ kind: "run", nodeId: null, text: "Starting the run" }];
    }
    case "workflow-step-start":
    case "workflow-step-result": {
      return stepEvents(type, payload, outcome);
    }
    case "workflow-step-output": {
      const output = OutputPayloadSchema.safeParse(payload);
      const beat = RunEventSchema.safeParse(
        output.success ? output.data.output : undefined
      );
      return beat.success ? [beat.data] : [];
    }
    case "workflow-finish": {
      const finish = FinishPayloadSchema.safeParse(payload);
      if (!finish.success) {
        return [];
      }
      if (finish.data.workflowStatus === "success") {
        return [{ kind: "end", nodeId: null, text: "The run is complete" }];
      }
      return [
        {
          kind: "end",
          nodeId: null,
          text:
            outcome.outOfTime && outcome.failure === null
              ? STOPPED_TEXT
              : "The run stopped, and nothing more will start",
        },
      ];
    }
    default: {
      return [];
    }
  }
};

// ── Bounds ──────────────────────────────────────────────────────────────

/** Beats one run keeps; the last few places are held for how it ended. */
export const EVENTS_PER_RUN = 400;
export const TERMINAL_EXTRA = 20;
export const MAX_TEXT = 240;
const MAX_DATA_CHARS = 600;
const THROTTLE_MS = 750;
const THROTTLED = new Set<RunEventKind>(["queue"]);

/** Kinds that always get a place, even when the run is full. */
export const isTerminal = (kind: RunEventKind): boolean =>
  kind === "error" || kind === "end" || kind === "done";

const clip = (text: string): string =>
  text.length <= MAX_TEXT ? text : `${text.slice(0, MAX_TEXT - 1)}…`;

/**
 * What a drive lets through: text and data cut to size, a repeat of the
 * node's last beat dropped, and a fast-changing kind (a queue position)
 * spaced out. Time is injected so the spacing is tested without waiting.
 */
export class RunEventGate {
  readonly #now: () => number;
  readonly #last = new Map<string, string>();
  readonly #lastAt = new Map<string, number>();

  constructor(now: () => number) {
    this.#now = now;
  }

  accept(event: RunEventInput): RunEventInput | null {
    const slot = event.nodeId ?? "";
    const text = clip(event.text.trim());
    if (text === "") {
      return null;
    }
    const signature = `${event.kind}:${text}`;
    if (this.#last.get(slot) === signature) {
      return null;
    }
    const at = this.#now();
    if (THROTTLED.has(event.kind)) {
      const before = this.#lastAt.get(`${slot}:${event.kind}`);
      if (before !== undefined && at - before < THROTTLE_MS) {
        return null;
      }
      this.#lastAt.set(`${slot}:${event.kind}`, at);
    }
    this.#last.set(slot, signature);
    const data =
      event.data !== undefined &&
      JSON.stringify(event.data).length <= MAX_DATA_CHARS
        ? event.data
        : undefined;
    return {
      kind: event.kind,
      nodeId: event.nodeId,
      text,
      ...(data !== undefined && { data }),
    };
  }
}

// ── The beat as a client reads it ───────────────────────────────────────

/** A stored beat as the events route sends it. */
export const BeatSchema = z.object({
  at: z.string(),
  data: RunEventDataSchema.nullable(),
  kind: z.enum(RUN_EVENT_KINDS),
  nodeId: z.string().nullable(),
  seq: z.number().int().positive(),
  text: z.string(),
});

export type Beat = z.infer<typeof BeatSchema>;
