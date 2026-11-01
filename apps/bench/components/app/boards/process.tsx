"use client";

import { useState } from "react";

import { ChevronDownIcon } from "@/components/app/boards/icons";
import {
  KIND_LABELS,
  offsetLabel,
  recent,
  summaryOf,
} from "@/lib/app/boards/process";
import type { NodeProcess } from "@/lib/app/boards/process";
import type { Beat } from "@/lib/app/boards/run-events";

/** How much of each earlier line stays: the nearest is the clearest. */
const RECEDE = [0.5, 0.32, 0.18] as const;

type Tone = "paper" | "plate";

const TONES: Readonly<
  Record<Tone, { readonly main: string; readonly quiet: string }>
> = {
  paper: { main: "text-ink", quiet: "text-muted" },
  plate: { main: "text-plate-ink", quiet: "text-plate-muted" },
};

/**
 * The beats of a node that is being worked on: the current one set large and
 * calm, the few before it receding above with the seconds each came after
 * the first, and a hairline rail of the beats so far. A new beat slides up
 * and fades in; the rest lift. Under reduced motion they only crossfade.
 */
export function LiveBeats({
  beats,
  depth = 3,
  tone = "paper",
}: {
  readonly beats: readonly Beat[];
  readonly depth?: number;
  readonly tone?: Tone;
}) {
  const { current, past } = recent(beats, depth);
  const [first] = beats;
  if (current === undefined || first === undefined) {
    return null;
  }
  const colours = TONES[tone];
  return (
    <div className="flex flex-col gap-1.5">
      <div aria-hidden="true" className="flex flex-col gap-0.5">
        {past.map((beat, index) => {
          // Nearest the current line is last in `past`.
          const rank = past.length - 1 - index;
          return (
            <p
              className={`board-beat-past type-small flex items-baseline justify-between gap-3 ${colours.quiet}`}
              key={`${beat.seq}-${rank}`}
              style={{ opacity: RECEDE[rank] ?? 0.12 }}
            >
              <span className="truncate">{beat.text}</span>
              <span className="board-mono shrink-0">
                {offsetLabel(beat, first)}
              </span>
            </p>
          );
        })}
      </div>
      <output
        className={`board-beat board-beat-current line-clamp-2 ${colours.main}`}
        key={current.seq}
      >
        {current.text}
      </output>
      <span
        aria-hidden="true"
        className={`board-rail mt-1.5 flex gap-0.5 ${tone === "plate" ? "on-plate" : ""}`}
      >
        {beats.map((beat, index) => (
          <span
            className={index === beats.length - 1 ? "is-current" : ""}
            key={beat.seq}
          />
        ))}
      </span>
    </div>
  );
}

/** The soft, slow movement behind the words: a breathing glow and a
 * shimmer that crosses the well. Both animate only transform and opacity. */
export function LiveGlow({ tone = "paper" }: { readonly tone?: Tone }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`board-live-breathe ${tone === "plate" ? "on-plate" : ""}`}
      />
      <span
        aria-hidden="true"
        className={`board-live-shimmer ${tone === "plate" ? "on-plate" : ""}`}
      />
    </>
  );
}

/** A Compare's process, on its dark plate, above the Models' wells. */
export function PlateProcess({ process }: { readonly process: NodeProcess }) {
  if (process.beats.length === 0) {
    return null;
  }
  return (
    <div className="board-plate-well board-live relative mb-4 h-40 overflow-hidden rounded">
      <LiveGlow tone="plate" />
      <div className="absolute inset-x-0 bottom-0 px-4 pb-3.5">
        <LiveBeats beats={process.beats} depth={3} tone="plate" />
      </div>
    </div>
  );
}

const lineTime = (beat: Beat, first: Beat): string => offsetLabel(beat, first);

/**
 * The settings panel's Process: every beat of the node's latest run in
 * order, each with the seconds it came after the first, a quiet label for
 * what kind of beat it is, and the current one marked. While the run goes it
 * is open; once the node has finished it folds into one line that opens
 * again.
 */
export function ProcessLog({ process }: { readonly process: NodeProcess }) {
  const [open, setOpen] = useState(false);
  const { beats } = process;
  const [first] = beats;
  if (first === undefined) {
    return null;
  }
  const shown = process.live || open;
  const last = beats.at(-1);
  return (
    <section className="flex flex-col gap-1">
      <h3 className="type-small text-muted flex items-baseline justify-between">
        <span>Process</span>
        {process.live ? (
          <span className="board-mono">{lineTime(last ?? first, first)}</span>
        ) : null}
      </h3>
      {process.live ? null : (
        <button
          aria-expanded={open}
          className="board-rule-top flex min-h-11 w-full items-center justify-between gap-2 pt-1 text-left"
          onClick={() => {
            setOpen(!open);
          }}
          type="button"
        >
          <span
            className={`type-small min-w-0 ${process.failed ? "text-bad" : "text-muted"}`}
          >
            {summaryOf(beats)}
          </span>
          <ChevronDownIcon className={open ? "rotate-180" : "-rotate-90"} />
        </button>
      )}
      {shown ? (
        <ol className="flex flex-col pt-1">
          {beats.map((beat) => {
            const marked = process.live && beat.seq === last?.seq;
            return (
              <li
                className="grid grid-cols-[3.25rem_1fr] items-baseline gap-2 py-1"
                key={beat.seq}
              >
                <span className="board-mono text-faint">
                  {lineTime(beat, first)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="type-small text-faint flex items-center gap-1.5">
                    {marked ? (
                      <span
                        aria-hidden="true"
                        className="board-beat-dot bg-ink inline-block size-1.5 rounded-full"
                      />
                    ) : null}
                    {KIND_LABELS[beat.kind]}
                  </span>
                  <span
                    className={`text-sm leading-5 ${beat.kind === "error" ? "text-bad" : marked ? "text-ink" : "text-muted"}`}
                  >
                    {beat.text}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
