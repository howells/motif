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

/** The price on what the node reads now, as the approval showed it: the list
 * price, not the hold. The approved hold is mentioned only when it differs
 * from the hold now. */
export const priceLine = (
  listMicros: number,
  holdMicros: number,
  approvedMicros: number
): Line => ({
  data: { approvedMicros, holdMicros, listMicros },
  kind: "price",
  text:
    holdMicros === approvedMicros
      ? `Price checked again: ${formatUsd(listMicros)}`
      : `Price checked again: ${formatUsd(listMicros)} (you approved holding up to ${formatUsd(approvedMicros)})`,
});

/** What is held, which can be more than the price: headroom for a Model that
 * bills by usage. */
export const holdLine = (boundMicros: number): Line => ({
  data: { micros: boundMicros },
  kind: "hold",
  text: `Holding up to ${formatUsd(boundMicros)} until fal settles`,
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
    case "logs":
    case "polled": {
      return null;
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
    return {
      data: { releasedMicros: generation.boundMicros },
      kind: "settle",
      text: `Nothing charged, ${formatUsd(generation.boundMicros)} released`,
    };
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
    text: `Holding up to ${formatUsd(total)} together: ${list(holds.map((hold) => `${hold.name} ${formatUsd(hold.micros)}`))}`,
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

/** What the owner's own history says this Model takes: said once, when fal
 * starts making. */
export const typicalLine = (name: string, ms: number): Line => ({
  data: { model: name, typicalMs: ms },
  kind: "make",
  text: `${name} usually takes about ${formatSeconds(ms)}`,
});

/** A line fal wrote while it worked, as it wrote it. */
export const logLine = (message: string): Line => ({
  kind: "log",
  text: message,
});

/** How often a wait with no news says it is still going. */
export const ELAPSED_EVERY_MS = 15_000;

/**
 * Notices when fal has gone quiet. It is told every worker event with the
 * time, and answers with "Still making it, 30 s in" once the status has
 * stood for `ELAPSED_EVERY_MS` since the last thing said. A new status or a
 * new place in line counts as news and starts the count again. `origin` is
 * when the wait began as far as is known: a run picked up from an earlier
 * drive counts from when it was sent, not from when it was found.
 */
export class Waiting {
  readonly #origin: number;
  #status: string | undefined;
  #since: number;
  #last: number;

  constructor(origin: number) {
    this.#origin = origin;
    this.#since = origin;
    this.#last = origin;
  }

  see(event: WorkerEvent, at: number): Line | null {
    if (event.kind === "queue") {
      if (event.status !== this.#status) {
        this.#since = this.#status === undefined ? this.#origin : at;
        this.#status = event.status;
      }
      this.#last = at;
      return null;
    }
    if (event.kind !== "polled" || at - this.#last < ELAPSED_EVERY_MS) {
      return null;
    }
    const elapsed = formatSeconds(at - this.#since);
    this.#last = at;
    if (event.status === "processing" || event.status === "in_progress") {
      return {
        data: { elapsedMs: at - this.#since },
        kind: "wait",
        text: `Still making it, ${elapsed} in`,
      };
    }
    if (event.status === "queued") {
      return {
        data: { elapsedMs: at - this.#since },
        kind: "wait",
        text: `Still in the queue, ${elapsed} in`,
      };
    }
    return null;
  }
}

/** Log lines of fal's one Generation says: a chatty Model must not fill the
 * run's places. */
export const MAX_LOG_LINES = 10;

/**
 * What one Generation says as the worker reports, in order: the queue in
 * plain words, a still-working line when fal has gone quiet, fal's own log
 * lines (few), the owner's typical time when fal starts making, and the image
 * coming back. Time and the history lookup are handed in.
 */
export class Narrator {
  readonly #name: string;
  readonly #waiting: Waiting;
  readonly #typical: () => Promise<Line | null>;
  #logsSaid = 0;
  #typicalAsked = false;

  constructor(options: {
    readonly name: string;
    readonly origin: number;
    readonly typical: () => Promise<Line | null>;
  }) {
    this.#name = options.name;
    this.#waiting = new Waiting(options.origin);
    this.#typical = options.typical;
  }

  async lines(event: WorkerEvent, at: number): Promise<Line[]> {
    if (event.kind === "logs") {
      const room = Math.max(0, MAX_LOG_LINES - this.#logsSaid);
      const said = event.lines.slice(0, room);
      this.#logsSaid += said.length;
      return said.map((line) => logLine(line));
    }
    const out: Line[] = [];
    const waited = this.#waiting.see(event, at);
    if (waited !== null) {
      out.push(waited);
    }
    const spoken = workerLine(event, this.#name);
    if (spoken !== null) {
      out.push(spoken);
    }
    if (
      event.kind === "queue" &&
      event.status === "processing" &&
      !this.#typicalAsked
    ) {
      this.#typicalAsked = true;
      const typical = await this.#typical();
      if (typical !== null) {
        out.push(typical);
      }
    }
    return out;
  }
}
