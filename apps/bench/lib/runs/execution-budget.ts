import { BENCH_ROUTES } from "@motif/bench-core";
import { isVercelRuntime } from "@motif/bench-env/runtime";

import { perAttemptTimeoutMs } from "./live-engine";

// The start and retry routes must statically export the same maxDuration.
const HOSTED_MAX_DURATION_MS = 300_000;
const PERSISTENCE_MARGIN_MS = 30_000;

export class HostedRunTooLongError extends Error {
  constructor() {
    super(
      "This sweep's timeout allowance exceeds the hosted 300-second limit. Select fewer samples or run this sweep locally."
    );
    this.name = "HostedRunTooLongError";
  }
}

/** Check before inserts or retry resets. Each attempt's outer deadline is
 * twice its HTTP timeout; a pool needs at most ceil(samples / lanes) waves
 * of its longest attempt. Reserve time for DB writes and image persistence.
 * Local servers keep their existing long-lived sweep path. */
export const assertHostedExecutionFits = (
  modelAliases: readonly string[],
  concurrency: number
): void => {
  if (!isVercelRuntime() || modelAliases.length === 0) {
    return;
  }
  const longestAttemptMs = Math.max(
    ...modelAliases.map((alias) => {
      const route = BENCH_ROUTES.find((candidate) => candidate.alias === alias);
      return perAttemptTimeoutMs(route?.speedP95Seconds ?? null) * 2;
    })
  );
  const waves = Math.ceil(modelAliases.length / Math.max(1, concurrency));
  if (
    waves * longestAttemptMs + PERSISTENCE_MARGIN_MS >
    HOSTED_MAX_DURATION_MS
  ) {
    throw new HostedRunTooLongError();
  }
};
