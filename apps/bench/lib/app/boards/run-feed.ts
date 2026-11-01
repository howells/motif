/**
 * The events feed: a run's stored beats as server-sent events.
 *
 * `feedFrames` tails the table. Every tick it asks whether the run is still
 * going, then reads what is new; a run that has stopped closes the feed only
 * once a read after that finds nothing left, so no beat is lost to the race.
 * It closes by itself before the host's limit (the browser reconnects with
 * `Last-Event-ID` and carries on) and says `end` when the run is over, so the
 * browser knows not to. Time and reading are injected, so the logic is tested
 * without a clock or a database.
 */
import type { Beat } from "./run-events";

/** How often the table is read. */
export const FEED_TICK_MS = 600;

/** A comment this often keeps proxies from closing a quiet feed. */
export const HEARTBEAT_MS = 15_000;

/** Close before the route's 300 s limit so it is never hit. */
export const FEED_BUDGET_MS = 250_000;

/** Beats read at a time. */
export const FEED_PAGE = 200;

export interface FeedDeps {
  readonly read: (after: number, limit: number) => Promise<readonly Beat[]>;
  readonly running: () => Promise<boolean>;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly aborted: () => boolean;
}

export const beatFrame = (beat: Beat): string =>
  `id: ${beat.seq}\nevent: beat\ndata: ${JSON.stringify(beat)}\n\n`;

export const END_FRAME = "event: end\ndata: {}\n\n";
export const HEARTBEAT_FRAME = ": keep-alive\n\n";
const OPEN_FRAME = "retry: 2000\n\n";

/** The `Last-Event-ID` header or `?after=` as a sequence number: anything
 * that isn't a whole number starts from the beginning. */
export const afterOf = (
  header: string | null,
  query: string | null
): number => {
  for (const value of [header, query]) {
    if (value !== null && /^\d{1,9}$/u.test(value)) {
      return Number(value);
    }
  }
  return 0;
};

export async function* feedFrames(
  deps: FeedDeps,
  after: number
): AsyncGenerator<string> {
  const started = deps.now();
  let last = after;
  let lastSent = started;
  yield OPEN_FRAME;
  while (!deps.aborted()) {
    const live = await deps.running();
    const beats = await deps.read(last, FEED_PAGE);
    for (const beat of beats) {
      yield beatFrame(beat);
      last = beat.seq;
    }
    if (beats.length > 0) {
      lastSent = deps.now();
      continue;
    }
    if (!live) {
      yield END_FRAME;
      return;
    }
    const at = deps.now();
    if (at - started >= FEED_BUDGET_MS) {
      return;
    }
    if (at - lastSent >= HEARTBEAT_MS) {
      yield HEARTBEAT_FRAME;
      lastSent = at;
    }
    await deps.sleep(FEED_TICK_MS);
  }
}
