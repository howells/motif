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

/** Beats that are bookends rather than steps. */
const BOOKENDS = new Set<RunEventKind>(["begin", "done", "run", "end"]);

/** The quiet label for a kind of beat. */
export const KIND_LABELS: Readonly<Record<RunEventKind, string>> = {
  arm: "Model",
  begin: "Start",
  compare: "Compare",
  done: "Done",
  end: "Run",
  error: "Failed",
  hold: "Hold",
  image: "Image",
  make: "Making",
  pick: "Pick",
  price: "Price",
  queue: "Queue",
  read: "Reading",
  run: "Run",
  send: "fal",
  settle: "Cost",
  stale: "Stale",
  store: "Stored",
};

const ms = (beat: Beat): number => Date.parse(beat.at);

/** How long after the node's first beat this one came, as "4.2 s". */
export const offsetLabel = (beat: Beat, first: Beat): string =>
  formatSeconds(Math.max(0, ms(beat) - ms(first)));

export interface NodeProcess {
  readonly beats: readonly Beat[];
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
};

/** Where a node stands in a run, from its own beats and the run's status. */
export const processOf = (
  beats: readonly Beat[],
  runStatus: "completed" | "failed" | "running" | "stopped"
): NodeProcess => {
  const failed = beats.some((beat) => beat.kind === "error");
  const finished = failed || beats.some((beat) => beat.kind === "done");
  return {
    beats,
    failed,
    finished,
    live: runStatus === "running" && !finished && beats.length > 0,
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
