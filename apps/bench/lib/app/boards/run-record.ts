/**
 * Keeping what a workflow says as it works. The steps only emit; this is the
 * one place a Mastra stream becomes rows in `app_run_events`.
 */
import type { AppSql } from "@motif/bench-db/app-sql";

import { appendRunEvent } from "./run-event-store";
import { RunEventGate, eventsOf, isTerminal } from "./run-events";
import type { RunEventInput, RunOutcome } from "./run-events";

export interface RecordTo {
  readonly sql: AppSql;
  readonly ownerId: string;
  readonly runId: string;
  readonly now: () => number;
  /** How the run ended, noted by the steps where it happened. */
  readonly outcome: RunOutcome;
}

/**
 * Read a workflow's stream to its end, keeping each beat in order. A beat
 * that can't be kept is logged and the run goes on: the feed is decoration,
 * and the workflow it describes spends money.
 */
export const recordStream = async (
  to: RecordTo,
  chunks: AsyncIterable<unknown>
): Promise<void> => {
  const gate = new RunEventGate(to.now);
  let full = false;
  // One at a time and in order: a beat's place is the one after the last.
  const keep = async (events: readonly RunEventInput[]): Promise<void> => {
    const [raw, ...rest] = events;
    if (raw === undefined) {
      return;
    }
    const event = gate.accept(raw);
    if (event !== null && !(full && !isTerminal(event.kind))) {
      try {
        full =
          (await appendRunEvent(to.sql, to.ownerId, to.runId, event)) ===
          "full";
      } catch (error) {
        console.error(`[board run] ${to.runId} couldn't keep a beat`, error);
      }
    }
    await keep(rest);
  };
  for await (const chunk of chunks) {
    await keep(eventsOf(chunk, to.outcome));
  }
};
