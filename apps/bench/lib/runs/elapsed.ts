/**
 * How long a sample has been in the air, derived at read time.
 *
 * The server sends an elapsed *duration*, not the `startedAt` instant, and
 * that is the whole point: the browser's clock and the server's clock can
 * disagree by seconds, and a counter rendered from `Date.now() - startedAt`
 * in the browser would start at the skew rather than at zero — occasionally
 * negative. A duration is skew-free, and the client re-anchors it against
 * its own monotonic clock on every poll (`LiveElapsed`).
 *
 * Pure, so both stores derive it identically and neither has to remember to.
 */
import type { SampleStatus } from "./types";

interface ElapsedInput {
  /** Injected rather than read from `Date.now()` so this is testable. */
  readonly now: number;
  readonly startedAt: Date | null;
  readonly status: SampleStatus;
}

/** Non-null only for a sample that has been dispatched and has not settled.
 *
 * A settled sample returns `null` even though the arithmetic would still
 * work: once it lands, the honest number is the *measured* `providerMs`, and
 * leaving a live elapsed alongside it would offer a second, longer duration
 * for the same event with no way to tell which one the run actually reports.
 */
export const elapsedMsFor = ({
  now,
  startedAt,
  status,
}: ElapsedInput): number | null => {
  if (status !== "pending" || startedAt === null) {
    return null;
  }
  // Clamped rather than trusted. `startedAt` is written by whichever instance
  // dispatched the sample and read by whichever one serves the poll; on a
  // millisecond of clock disagreement between them an unclamped value renders
  // as a negative stopwatch.
  return Math.max(0, now - startedAt.getTime());
};
