"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** The stopwatch under a frame that is still generating.
 *
 * It counts from a *duration* handed over by the server, not from a start
 * instant, and re-anchors every time a poll delivers a fresher one
 * (`lib/runs/elapsed.ts` explains why: subtracting the server's clock from
 * the browser's would start the count at the skew between them, sometimes
 * negative). Anchored on `performance.now()` rather than `Date.now()`
 * because it is monotonic — a laptop waking from sleep or an NTP correction
 * mid-run cannot make this counter run backwards.
 *
 * The count is deliberately not reconciled against the figure that replaces
 * it. This measures wall time around the whole attempt; what the run finally
 * reports is `providerMs`, the provider's share of that. They are different
 * quantities, so the live one is muted and the settled one is ink — the
 * change in weight is what says "this is the measurement now".
 */

/** Fast enough that the tenths digit reads as motion rather than as a series
 * of separate values. */
const TICK_MS = 100;

// ---------------------------------------------------------------------------
// One ticker for the whole sheet
// ---------------------------------------------------------------------------

/** A full sweep puts 24 of these on screen at once. Each owning its own
 * interval would be 240 renders a second, all unbatched because the timers
 * would be staggered by however long each `useEffect` took to run. One
 * module-level ticker means React sees a single store change per tick and
 * updates every counter in one pass — and when nothing is generating, the
 * interval does not exist at all. */
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let nowMs = 0;

const subscribe = (onStoreChange: () => void): (() => void) => {
  listeners.add(onStoreChange);
  if (intervalId === null) {
    // Seeded before the first tick, not left at zero. `performance.now()` is
    // milliseconds since the page loaded, so a store still reading 0 when
    // the first tick lands reports the entire age of the tab as elapsed —
    // a counter that opened at 0.1s and jumped to 21.0s one tick later.
    nowMs = performance.now();
    intervalId = setInterval(() => {
      nowMs = performance.now();
      for (const listener of listeners) {
        listener();
      }
    }, TICK_MS);
  }

  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
};

const getSnapshot = (): number => nowMs;
/** There is no monotonic clock shared with the browser, so the server renders
 * the counter at exactly the elapsed value it just measured — the `Math.max`
 * below turns this into "no time has passed yet", which is the only honest
 * thing to say before hydration. */
const getServerSnapshot = (): number => 0;

const usePrefersReducedMotion = (): boolean => {
  const [prefers, setPrefers] = useState(false);

  useEffect(() => {
    const query = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(query.matches);
    const onChange = (event: MediaQueryListEvent) => {
      setPrefers(event.matches);
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  return prefers;
};

/** Always seconds, never switching to `ms` below a second the way `formatMs`
 * does — a counter that changes its own unit as it climbs cannot be read as
 * one rising number. */
const formatElapsed = (ms: number, whole: boolean): string =>
  `${(ms / 1000).toFixed(whole ? 0 : 1)}s`;

interface LiveElapsedProps {
  /** Milliseconds elapsed as of the moment the server built the response. */
  readonly elapsedMs: number;
}

export const LiveElapsed = ({ elapsedMs }: LiveElapsedProps) => {
  const reducedMotion = usePrefersReducedMotion();
  const tickNow = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  // Re-anchoring during render rather than in an effect, so a poll's fresher
  // duration is on screen in the same commit it arrived in — an effect would
  // paint one frame of the stale count first.
  // Read straight off the monotonic clock rather than off the store: the
  // store only moves on a tick, so anchoring to it puts the anchor up to one
  // tick in the past and the counter opens that far ahead of zero.
  const [anchor, setAnchor] = useState(() => ({
    at: performance.now(),
    base: elapsedMs,
  }));
  if (anchor.base !== elapsedMs) {
    setAnchor({ at: performance.now(), base: elapsedMs });
  }

  // Clamped because the anchor is captured from the *previous* tick's
  // snapshot, so the first render after re-anchoring can see a `tickNow`
  // fractionally behind it.
  const displayMs = anchor.base + Math.max(0, tickNow - anchor.at);

  return (
    <span
      // `role="timer"` rather than a bare span with an `aria-label` — an
      // aria-label on a generic element is dropped on the floor. Timer is a
      // live region whose implicit `aria-live` is **off**, which is the
      // property being bought here: the element is named as a running clock
      // without a new number being read out ten times a second. The settled
      // latency is the value worth hearing, and it arrives as ordinary
      // content.
      aria-label="Generating"
      className="bench-numeric text-plate-muted"
      role="timer"
    >
      {/* Under `prefers-reduced-motion` a digit flickering ten times a second
          is exactly the movement being opted out of — but a stopwatch frozen
          at its first value is a broken instrument, not an accessible one. It
          keeps counting, in whole seconds. */}
      {formatElapsed(displayMs, reducedMotion)}
    </span>
  );
};
