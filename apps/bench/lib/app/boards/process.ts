/**
 * What the canvas makes of a run's beats: the ones that belong to a node, how
 * long each came after the first, the current line and the few before it,
 * and the one-line summary a finished run folds into. Plain functions, safe
 * in the browser and tested without one.
 */
import { formatSeconds, formatUsd } from "@/lib/app/money";

import type { Beat, RunEventKind } from "./run-events";

/** Merge new beats into the ones held, by sequence number, oldest first. */
export const foldBeats = (
  held: readonly Beat[],
  incoming: readonly Beat[]
): Beat[] => {
  const bySeq = new Map(held.map((beat) => [beat.seq, beat]));
  for (const beat of incoming) {
    bySeq.set(beat.seq, beat);
  }
  return [...bySeq.values()].toSorted((a, b) => a.seq - b.seq);
};

/** The beats about one node. */
export const beatsOfNode = (beats: readonly Beat[], nodeId: string): Beat[] =>
  beats.filter((beat) => beat.nodeId === nodeId);

/** Beats that are bookends or reassurance rather than steps. */
const BOOKENDS = new Set<RunEventKind>(["begin", "done", "run", "end", "wait"]);

const ms = (beat: Beat): number => Date.parse(beat.at);

/** When the run began, by the clock of its first beat. */
export const originOf = (beats: readonly Beat[]): number | null => {
  const [first] = beats;
  return first === undefined ? null : ms(first);
};

/** How long after the run began this beat came, as "4.2 s". Always climbing
 * down the log, since the beats are in order. */
export const offsetLabel = (beat: Beat, origin: number): string =>
  formatSeconds(Math.max(0, ms(beat) - origin));

const isTypical = (beat: Beat): boolean =>
  beat.kind === "make" && typeof beat.data?.typicalMs === "number";

/** Repeated quiet beats ("Still making it, 30 s in") say the same thing
 * again: only the latest of a node's stays. */
export const collapsed = (beats: readonly Beat[]): Beat[] => {
  const latest = beats.findLast((beat) => beat.kind === "wait");
  return beats.filter((beat) => beat.kind !== "wait" || beat === latest);
};

const SHORT: Partial<Record<RunEventKind, (beat: Beat) => string>> = {
  hold: () => "Hold placed",
  image: () => "Image back",
  price: () => "Price checked",
  queue: () => "Was in the queue",
  read: (beat) => beat.text.replace(/^Reading\b/u, "Read"),
  send: (beat) =>
    typeof beat.data?.model === "string" ? "Sent to fal" : beat.text,
  store: () => "Stored",
  wait: () => "Still waiting",
};

/** A beat in the few words it keeps once a newer one has taken its place:
 * "Sent to fal" for "Sending to fal: Grok Imagine Image 2.0". Never cut
 * short with an ellipsis; a beat with no shorter form is kept whole. */
export const shortText = (beat: Beat): string =>
  SHORT[beat.kind]?.(beat) ?? beat.text;

/** What the well shows of a run: the quiet repeats folded away and the
 * owner's typical time left to the panel's log. */
export const wellBeats = (beats: readonly Beat[]): Beat[] =>
  collapsed(beats).filter((beat) => !isTypical(beat));

export interface LogRow {
  readonly beat: Beat;
  /** A quiet sub-line under the beat, such as the Model's usual time. */
  readonly note: string | null;
}

/** The panel's log: each beat once, the owner's typical time as a quiet
 * line under the beat before it. */
export const logRows = (beats: readonly Beat[]): LogRow[] => {
  const rows: LogRow[] = [];
  for (const beat of collapsed(beats)) {
    const before = rows.at(-1);
    if (isTypical(beat) && before !== undefined) {
      rows[rows.length - 1] = { beat: before.beat, note: beat.text };
    } else {
      rows.push({ beat, note: null });
    }
  }
  return rows;
};

export interface NodeProcess {
  readonly beats: readonly Beat[];
  /** When the run began, so every time counts from the same moment. */
  readonly origin: number | null;
  /** The run is still going and this node has not finished in it. */
  readonly live: boolean;
  readonly failed: boolean;
  readonly finished: boolean;
}

export const NO_PROCESS: NodeProcess = {
  beats: [],
  failed: false,
  finished: false,
  live: false,
  origin: null,
};

/** Where a node stands in a run, from its own beats and the run's status. */
export const processOf = (
  beats: readonly Beat[],
  runStatus: "completed" | "failed" | "running" | "stopped",
  origin: number | null = originOf(beats)
): NodeProcess => {
  const failed = beats.some((beat) => beat.kind === "error");
  const finished = failed || beats.some((beat) => beat.kind === "done");
  return {
    beats,
    failed,
    finished,
    live: runStatus === "running" && !finished && beats.length > 0,
    origin,
  };
};

/** The line to say now, and the lines before it, nearest last. */
export const recent = (
  beats: readonly Beat[],
  depth: number
): { readonly current: Beat | undefined; readonly past: readonly Beat[] } => {
  const current = beats.at(-1);
  return {
    current,
    past: beats.slice(Math.max(0, beats.length - 1 - depth), -1),
  };
};

const numberOf = (beat: Beat, key: string): number | null => {
  const value = beat.data?.[key];
  return typeof value === "number" ? value : null;
};

/** What the run counted against the cap for this node, from its cost beats. */
const moneyTail = (beats: readonly Beat[]): string | null => {
  const costs = beats.filter((beat) => beat.kind === "settle");
  const known = costs.flatMap((beat) => {
    const micros = numberOf(beat, "micros");
    return micros === null
      ? []
      : [{ estimated: beat.data?.estimated === true, micros }];
  });
  if (known.length === 0) {
    return null;
  }
  const total = known.reduce((sum, cost) => sum + cost.micros, 0);
  return known.some((cost) => cost.estimated)
    ? `Counted at ${formatUsd(total)}, estimate`
    : `Settled at ${formatUsd(total)}`;
};

/** "7 steps · 31 s · Settled at $0.50, estimate": a finished node on one
 * line. A failure says so in its own words instead of the money. */
export const summaryOf = (beats: readonly Beat[]): string => {
  const [first] = beats;
  const last = beats.at(-1);
  if (first === undefined || last === undefined) {
    return "";
  }
  const steps = beats.filter((beat) => !BOOKENDS.has(beat.kind)).length;
  const parts = [
    steps === 1 ? "1 step" : `${steps} steps`,
    formatSeconds(Math.max(0, ms(last) - ms(first))),
  ];
  const failure = beats.find((beat) => beat.kind === "error");
  const tail = failure === undefined ? moneyTail(beats) : failure.text;
  return tail === null ? parts.join(" · ") : [...parts, tail].join(" · ");
};

// ── One source for the node and its panel ───────────────────────────────

/** A run as far as finding a node's process needs it. */
export interface RunRef {
  readonly id: string;
  readonly nodeIds: readonly string[];
  readonly status: "completed" | "failed" | "running" | "stopped";
}

/** The beats held for one run. */
export interface Feed {
  readonly runId: string | null;
  readonly beats: readonly Beat[];
}

/** The newest run that touched a node. `runs` is newest first. */
export const latestRunOf = <R extends RunRef>(
  runs: readonly R[],
  nodeId: string
): R | undefined => runs.find((run) => run.nodeIds.includes(nodeId));

/**
 * What the latest run said about a node, from whichever held feed is for that
 * run. The node on the canvas and its panel both ask this, of the same runs
 * and the same feeds, so they cannot disagree.
 */
export const processForNode = (
  runs: readonly RunRef[],
  feeds: readonly Feed[],
  nodeId: string
): NodeProcess => {
  const run = latestRunOf(runs, nodeId);
  const feed = feeds.find((item) => run !== undefined && item.runId === run.id);
  return run === undefined || feed === undefined
    ? NO_PROCESS
    : processOf(
        beatsOfNode(feed.beats, nodeId),
        run.status,
        originOf(feed.beats)
      );
};

// ── Waiting for fal ─────────────────────────────────────────────────────

export interface Making {
  /** When fal began making it, by the clock of the beat that said so. */
  readonly startedAt: number;
  readonly typicalMs: number;
}

/** What the beats say about how long this should take: set by the beat that
 * gave this owner's typical time, and absent without one. */
export const makingOf = (beats: readonly Beat[]): Making | null => {
  const beat = beats.findLast(
    (candidate) =>
      candidate.kind === "make" && typeof candidate.data?.typicalMs === "number"
  );
  const typicalMs = beat === undefined ? null : numberOf(beat, "typicalMs");
  return beat === undefined || typicalMs === null || typicalMs <= 0
    ? null
    : { startedAt: ms(beat), typicalMs };
};

/** The most the fill ever shows: the image coming back is what completes it. */
export const FILL_CEILING = 0.97;

/**
 * How far along to draw a wait that usually takes `typicalMs`, `elapsedMs`
 * in: quick at first, slowing as the time comes, and never full. At the
 * typical time it shows about 86%.
 */
export const easedShare = (elapsedMs: number, typicalMs: number): number => {
  if (typicalMs <= 0) {
    return 0;
  }
  const x = Math.max(0, elapsedMs) / typicalMs;
  return FILL_CEILING * (1 - Math.exp(-2.2 * x));
};
