"use client";

import { useState } from "react";

import { CheckIcon, ChevronDownIcon } from "@/components/app/boards/icons";
import {
  easedShare,
  logRows,
  makingOf,
  offsetLabel,
  recent,
  shortText,
  summaryOf,
  wellBeats,
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
 * The bare hairline under the current beat, the seconds since the run began
 * at its right end in tabular figures. With this owner's typical time for the
 * Model it fills toward it, slowing as it nears and never full before the
 * image is back; without one it only sweeps, saying nothing about how long.
 * Only transform moves.
 */
function TimeRail({
  beats,
  elapsed,
  now,
  tone,
}: {
  readonly beats: readonly Beat[];
  readonly elapsed: number;
  readonly now: number;
  readonly tone: Tone;
}) {
  const making = makingOf(beats);
  return (
    <div aria-hidden="true" className="flex items-center gap-3">
      <span
        className={`board-time-rail flex-1 ${tone === "plate" ? "on-plate" : ""}`}
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
      <span className={`type-small shrink-0 tabular-nums ${TONES[tone].main}`}>
        {formatSeconds(elapsed)}
      </span>
    </div>
  );
}

/**
 * The beats of a node that is being worked on, stripped to what matters: the
 * one faint beat before, in its short form with the seconds it came after
 * the run began; the current one set large and calm, free to wrap to a
 * second line; and a bare rail with the elapsed time. A new beat slides up
 * and fades in. Under reduced motion they only crossfade. The earlier line
 * stays dark enough to read on the veil over a photograph.
 */
export function LiveBeats({
  beats,
  now,
  origin,
  tone = "paper",
}: {
  readonly beats: readonly Beat[];
  readonly now: number;
  readonly origin: number;
  readonly tone?: Tone;
}) {
  const { current, past } = recent(wellBeats(beats), 1);
  if (current === undefined) {
    return null;
  }
  const colours = TONES[tone];
  return (
    <div className="flex flex-col gap-3">
      {past.map((beat) => (
        <p
          aria-hidden="true"
          className={`board-beat-past type-small flex items-baseline justify-between gap-3 ${colours.quiet}`}
          key={beat.seq}
          style={{ opacity: RECEDE[0] }}
        >
          <span>{shortText(beat)}</span>
          <span className="shrink-0 tabular-nums">
            {offsetLabel(beat, origin)}
          </span>
        </p>
      ))}
      <output
        className={`board-beat board-beat-current ${colours.main}`}
        key={current.seq}
      >
        {current.text}
      </output>
      <TimeRail
        beats={beats}
        elapsed={Math.max(0, now - origin)}
        now={now}
        tone={tone}
      />
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
    <div className="board-plate-well board-live rounded-panel relative mb-4 h-40 overflow-hidden">
      <LiveGlow tone="plate" />
      <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
        <LiveBeats
          beats={process.beats}
          now={now}
          origin={process.origin ?? now}
          tone="plate"
        />
      </div>
    </div>
  );
}

/**
 * The settings panel's Process: every beat of the node's latest run in
 * order, each with the seconds since the run began, always climbing, and the
 * current one marked. It reads the same beats the node does. While the run
 * goes it is open and its header keeps the live total; once the node has
 * finished it folds into one line that opens again.
 */
export function ProcessLog({
  now,
  process,
}: {
  readonly now: number;
  readonly process: NodeProcess;
}) {
  const [open, setOpen] = useState(false);
  const { beats, origin } = process;
  if (beats.length === 0 || origin === null) {
    return null;
  }
  const shown = process.live || open;
  const rows = logRows(beats);
  const last = rows.at(-1);
  return (
    <section className="flex flex-col gap-1">
      <h3 className="type-small text-muted flex items-baseline justify-between">
        <span>Process</span>
        {process.live ? (
          <span className="tabular-nums">
            {formatSeconds(Math.max(0, now - origin))}
          </span>
        ) : null}
      </h3>
      {process.live ? null : (
        <button
          aria-expanded={open}
          className="board-rule-top min-h-control flex w-full items-center justify-between gap-2 pt-1 text-left"
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
          {rows.map(({ beat, note }) => {
            const marked = process.live && beat.seq === last?.beat.seq;
            return (
              <li
                className="grid grid-cols-[1rem_1fr_auto] items-baseline gap-2 py-1"
                key={beat.seq}
              >
                <span aria-hidden="true" className="flex items-center">
                  {marked ? (
                    <span className="board-beat-dot bg-ink inline-block size-1.5 rounded-full" />
                  ) : beat.kind === "error" ? null : (
                    <CheckIcon className="text-faint" size={14} />
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className={`type-body ${beat.kind === "error" ? "text-bad" : marked ? "text-ink" : "text-muted"}`}
                  >
                    {beat.text}
                  </span>
                  {note === null ? null : (
                    <span className="type-small text-faint">{note}</span>
                  )}
                </span>
                <span className="type-small text-faint tabular-nums">
                  {offsetLabel(beat, origin)}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
