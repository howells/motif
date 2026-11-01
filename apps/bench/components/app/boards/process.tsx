"use client";

import { useState } from "react";

import { ChevronDownIcon } from "@/components/app/boards/icons";
import {
  KIND_LABELS,
  easedShare,
  makingOf,
  offsetLabel,
  recent,
  summaryOf,
} from "@/lib/app/boards/process";
import type { NodeProcess } from "@/lib/app/boards/process";
import type { Beat } from "@/lib/app/boards/run-events";
import { RECEDE } from "@/lib/app/boards/veil";
import { formatSeconds } from "@/lib/app/money";

type Tone = "paper" | "plate";

const TONES: Readonly<
  Record<Tone, { readonly main: string; readonly quiet: string }>
> = {
  paper: { main: "text-ink", quiet: "text-ink" },
  plate: { main: "text-plate-ink", quiet: "text-plate-ink" },
};

/**
 * The hairline under the current beat. With this owner's typical time for the
 * Model it fills toward it, slowing as it nears and never full before the
 * image is back; without one it only sweeps, saying nothing about how long.
 * Only transform moves.
 */
function TimeRail({
  beats,
  now,
  tone,
}: {
  readonly beats: readonly Beat[];
  readonly now: number;
  readonly tone: Tone;
}) {
  const making = makingOf(beats);
  return (
    <span
      aria-hidden="true"
      className={`board-time-rail mt-2 ${tone === "plate" ? "on-plate" : ""}`}
    >
      {making === null ? (
        <span className="board-time-sweep" />
      ) : (
        <span
          className="board-time-fill"
          style={{
            transform: `scaleX(${easedShare(now - making.startedAt, making.typicalMs).toFixed(3)})`,
          }}
        />
      )}
    </span>
  );
}

/**
 * The beats of a node that is being worked on: the current one set large and
 * calm, the few before it receding above with the seconds each came after
 * the first, and a hairline of time under it. A new beat slides up and fades
 * in; the rest lift. Under reduced motion they only crossfade. The earlier
 * lines stay dark enough to read on the veil over a photograph.
 */
export function LiveBeats({
  beats,
  depth = 3,
  now,
  tone = "paper",
}: {
  readonly beats: readonly Beat[];
  readonly depth?: number;
  readonly now: number;
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
              style={{ opacity: RECEDE[rank] ?? RECEDE.at(-1) }}
            >
              <span className="truncate">{beat.text}</span>
              <span className="shrink-0 tabular-nums">
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
      <TimeRail beats={beats} now={now} tone={tone} />
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
export function PlateProcess({
  now,
  process,
}: {
  readonly now: number;
  readonly process: NodeProcess;
}) {
  if (process.beats.length === 0) {
    return null;
  }
  return (
    <div className="board-plate-well board-live relative mb-4 h-40 overflow-hidden rounded">
      <LiveGlow tone="plate" />
      <div className="absolute inset-x-0 bottom-0 px-4 pb-3.5">
        <LiveBeats beats={process.beats} depth={3} now={now} tone="plate" />
      </div>
    </div>
  );
}

/**
 * The settings panel's Process: every beat of the node's latest run in
 * order, each with the seconds it came after the first, a quiet label for
 * what kind of beat it is, and the current one marked. It reads the same
 * beats the node does. While the run goes it is open and its clock runs;
 * once the node has finished it folds into one line that opens again.
 */
export function ProcessLog({
  now,
  process,
}: {
  readonly now: number;
  readonly process: NodeProcess;
}) {
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
          <span className="tabular-nums">
            {formatSeconds(Math.max(0, now - Date.parse(first.at)))}
          </span>
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
            className={`type-small min-w-0 tabular-nums ${process.failed ? "text-bad" : "text-muted"}`}
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
                <span className="type-small text-faint tabular-nums">
                  {offsetLabel(beat, first)}
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
                    className={`text-sm leading-5 tabular-nums ${beat.kind === "error" ? "text-bad" : marked ? "text-ink" : "text-muted"}`}
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
