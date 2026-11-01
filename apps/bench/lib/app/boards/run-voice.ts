/**
 * The words a run uses about its own work. Plain sentences, the amounts in
 * the App's usual form, no jargon about queues or steps beyond what fal
 * itself calls them. Pure, so each line is tested as text.
 */
import { formatSeconds, formatUsd } from "../money";
import type { WorkerEvent } from "../tasks/execute";
import type { Generation } from "../tasks/store";
import { NODE_LABELS, kindAndSettings, upstreamOf } from "./model";
import type { RunEventData, RunEventKind } from "./run-events";
import type { BoardNode, Graph } from "./store";

export interface Line {
  readonly kind: RunEventKind;
  readonly text: string;
  readonly data?: RunEventData;
}

const list = (items: readonly string[]): string => {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
};

/** "Reading the Prompt, the Look and the Mood": what feeds the node, the Look
 * and Mood its Prompt carries, and its Reference images. */
export const readLine = (node: BoardNode, graph: Graph): Line => {
  const from = upstreamOf(node.id, graph.wires);
  const source = graph.nodes.find((candidate) => candidate.id === from);
  const parts: string[] = [];
  if (source !== undefined) {
    parts.push(
      source.kind === "prompt" || source.kind === "source"
        ? `the ${NODE_LABELS[source.kind]}`
        : `the image from ${NODE_LABELS[source.kind]}`
    );
  }
  if (source?.kind === "prompt") {
    // A Prompt carries the Look and Mood that colour what it feeds.
    const carried = kindAndSettings(source);
    if (carried.kind === "prompt") {
      if (carried.settings.look !== undefined) {
        parts.push("the Look");
      }
      if (carried.settings.mood !== undefined) {
        parts.push("the Mood");
      }
    }
  }
  const own = kindAndSettings(node);
  if (own.kind === "generate" && own.settings.references.length > 0) {
    const { length } = own.settings.references;
    parts.push(
      length === 1 ? "1 Reference image" : `${length} Reference images`
    );
  }
  return {
    kind: "read",
    text:
      parts.length === 0
        ? "Reading its own settings"
        : `Reading ${list(parts)}`,
  };
};

/** Pricing again, and holding to what was approved. */
export const priceLine = (
  micros: number,
  approved: number,
  onImage: boolean
): Line => ({
  data: { approvedMicros: approved, micros },
  kind: "price",
  text: `Pricing again ${onImage ? "on the real image" : "on what it reads now"}: ${formatUsd(micros)}, within the ${formatUsd(approved)} you approved`,
});

export const holdLine = (boundMicros: number): Line => ({
  data: { micros: boundMicros },
  kind: "hold",
  text: `Holding ${formatUsd(boundMicros)} until fal settles`,
});

/** fal's queue, in the words a person would use. */
export const queueLine = (status: string, position?: number): Line | null => {
  switch (status) {
    case "queued": {
      return {
        data: { position: position ?? null, status },
        kind: "queue",
        text:
          position === undefined || position <= 0
            ? "In the queue"
            : `In the queue, ${position} ahead`,
      };
    }
    case "processing":
    case "in_progress": {
      return { data: { status }, kind: "make", text: "fal is making it" };
    }
    case "completed": {
      return { data: { status }, kind: "make", text: "fal has finished" };
    }
    default: {
      return null;
    }
  }
};

/** What the worker reports, as a beat. `name` is the Model's display name. */
export const workerLine = (event: WorkerEvent, name: string): Line | null => {
  switch (event.kind) {
    case "sending": {
      return {
        data: { model: name },
        kind: "send",
        text: `Sending to fal: ${name}`,
      };
    }
    case "accepted": {
      return { kind: "send", text: "fal has it" };
    }
    case "queue": {
      return queueLine(event.status, event.queuePosition);
    }
    case "downloading": {
      return {
        kind: "image",
        text:
          event.count === 1
            ? "The image is back, bringing it in"
            : `${event.count} images are back, bringing them in`,
      };
    }
    case "stored": {
      return {
        data: {
          bytes: event.bytes,
          height: event.height,
          width: event.width,
        },
        kind: "store",
        text: `Stored, ${event.width} × ${event.height}`,
      };
    }
    default: {
      return null;
    }
  }
};

/** How a Generation's money ended, once it has. */
export const settledLine = (generation: Generation): Line | null => {
  if (generation.status === "completed") {
    if (generation.costStatus === "settled" && generation.costMicros !== null) {
      return {
        data: { estimated: false, micros: generation.costMicros },
        kind: "settle",
        text: `Settled at ${formatUsd(generation.costMicros)}`,
      };
    }
    return {
      data: { estimated: true, micros: generation.boundMicros },
      kind: "settle",
      text: `fal didn't say, the ${formatUsd(generation.boundMicros)} hold counts as an estimate`,
    };
  }
  if (generation.costStatus === "released") {
    return { kind: "settle", text: "Nothing was spent, the hold is released" };
  }
  return {
    data: { estimated: true, micros: generation.boundMicros },
    kind: "settle",
    text: `The ${formatUsd(generation.boundMicros)} hold stays counted`,
  };
};

export const pickLine = (): Line => ({
  kind: "pick",
  text: "Kept as the Pick",
});

export const staleLine = (count: number): Line => ({
  data: { count },
  kind: "stale",
  text:
    count === 1
      ? "1 node below is now Stale"
      : `${count} nodes below are now Stale`,
});

/** Compare: every Model's price held together, or none. */
export const compareHoldLine = (
  holds: readonly { readonly name: string; readonly micros: number }[]
): Line => {
  const total = holds.reduce((sum, hold) => sum + hold.micros, 0);
  return {
    data: { micros: total, models: holds.length },
    kind: "hold",
    text: `Holding ${list(holds.map((hold) => `${hold.name} ${formatUsd(hold.micros)}`))} together, ${formatUsd(total)} in all`,
  };
};

export const askingLine = (count: number): Line => ({
  data: { models: count },
  kind: "compare",
  text: `Asking ${count} Models at once`,
});

/** One Model of a Compare finished; the first to is said so. */
export const armHomeLine = (
  name: string,
  ms: number | null,
  first: boolean
): Line => ({
  data: { first, model: name, ms },
  kind: "arm",
  text: `${name} came back${first ? " first" : ""}${ms === null ? "" : `, ${formatSeconds(ms)}`}`,
});
