"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { foldBeats } from "@/lib/app/boards/process";
import { BeatSchema } from "@/lib/app/boards/run-events";
import type { Beat } from "@/lib/app/boards/run-events";

export interface RunBeats {
  readonly runId: string | null;
  readonly beats: readonly Beat[];
}

const NOTHING: RunBeats = { beats: [], runId: null };

interface Listener {
  readonly onBeats: (beats: readonly Beat[]) => void;
  readonly onPick: (beat: Beat) => void;
  readonly onEnd: () => void;
}

const parseBeat = (event: Event): Beat | null => {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(event.data);
  } catch {
    return null;
  }
  const read = BeatSchema.safeParse(json);
  return read.success ? read.data : null;
};

/** Listen to a run's feed; returns how to stop. Beats that arrive together
 * are handed over together, once a frame. */
const listen = (runId: string, listener: Listener): (() => void) => {
  const source = new EventSource(`/api/app/board-runs/${runId}/events`);
  let pending: Beat[] = [];
  let frame: number | null = null;
  const flush = () => {
    frame = null;
    const arrived = pending;
    pending = [];
    listener.onBeats(arrived);
  };
  const onBeat = (event: Event) => {
    const beat = parseBeat(event);
    if (beat === null) {
      return;
    }
    pending.push(beat);
    frame ??= requestAnimationFrame(flush);
    if (beat.kind === "pick") {
      listener.onPick(beat);
    }
  };
  const onEnd = () => {
    source.close();
    listener.onEnd();
  };
  source.addEventListener("beat", onBeat);
  source.addEventListener("end", onEnd);
  return () => {
    source.removeEventListener("beat", onBeat);
    source.removeEventListener("end", onEnd);
    source.close();
    if (frame !== null) {
      cancelAnimationFrame(frame);
    }
  };
};

const stay = (): void => {
  // No run to listen to, so nothing to close.
};

/**
 * A run's beats, live. The feed is decoration and an early nudge: results
 * still come from the polled run, so a feed that fails or never connects
 * costs the canvas nothing but the words. The browser reconnects by itself
 * with `Last-Event-ID` when the server closes the feed before its time
 * limit; the server says `end` when the run is over, and the feed closes
 * for good.
 *
 * `onSignal` hears the moments that mean something changed: a Pick was
 * kept, or the run ended.
 */
export const useRunBeats = (
  runId: string | null,
  onSignal?: () => void
): RunBeats => {
  const [held, setHeld] = useState<RunBeats>(NOTHING);
  const signal = useEffectEvent(() => {
    onSignal?.();
  });

  useEffect(() => {
    if (runId === null) {
      return stay;
    }
    return listen(runId, {
      onBeats: (arrived) => {
        setHeld((current) => ({
          beats: foldBeats(
            current.runId === runId ? current.beats : [],
            arrived
          ),
          runId,
        }));
      },
      onEnd: () => {
        signal();
      },
      onPick: () => {
        signal();
      },
    });
  }, [runId]);

  return held.runId === runId ? held : NOTHING;
};
