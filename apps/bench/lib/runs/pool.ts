/**
 * The execution limiter behind a run's `concurrency`.
 *
 * That field was collected in the composer, validated, persisted, shown in
 * the UI, and enforced by nothing: every sample was dispatched with a zero
 * delay, so a 24-model sweep fired 24 requests at fal simultaneously
 * whatever the number said. The measured evidence — a 23-sample run whose
 * per-sample latencies sum to 584s finishing in 153s of wall clock, with 8
 * of its 11 failures `RATE_LIMITED` — is what that looks like from the
 * outside.
 *
 * Two things were wrong with it, and both matter to a benchmark. Rate
 * limiting is the loud one. The quiet one is that every latency ever
 * recorded here includes queueing against 23 siblings, while the
 * `contended` badge that exists to say so is driven off `concurrency > 1`
 * and therefore never appeared.
 *
 * Pure and I/O-free so it can be tested without a database or a fal call —
 * the real store is only ever paired with the live engine, so an unproven
 * limiter here would be an unproven limiter everywhere.
 */

interface PoolOptions<T> {
  /** At most this many workers run at once. Clamped to at least 1, so a
   * malformed value degrades to serial execution rather than to a run that
   * dispatches nothing. */
  readonly limit: number;
  /** Called instead of rejecting. A throw from one item must not abandon
   * the items behind it in its lane — at `limit: 1` that would strand the
   * entire rest of the run, which is precisely the failure this module
   * exists to prevent. */
  readonly onError: (error: unknown, item: T, index: number) => void;
  readonly worker: (item: T, index: number) => Promise<void>;
}

/** Runs `worker` over every item, at most `limit` at a time, handing items
 * out in array order. Resolves once every item has settled.
 *
 * Lanes pull from a shared cursor rather than being given fixed slices, so
 * one slow model does not hold back the items that happen to sit behind it
 * in a pre-assigned partition — with `gpt2` at 151s against `flux-fast` at
 * 1.3s, static partitioning would leave lanes idle for minutes. */
export const runWithConcurrency = async <T>(
  items: readonly T[],
  { limit, onError, worker }: PoolOptions<T>
): Promise<void> => {
  if (items.length === 0) {
    return;
  }

  const lanes = Math.min(Math.max(1, Math.trunc(limit)), items.length);
  let cursor = 0;

  const lane = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      // `as T` is safe: `index < items.length` was just checked, and the
      // cursor is only ever incremented.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- bounds-checked on the line above; readonly T[] cannot express "index is in range" to the compiler
      const item = items[index] as T;
      try {
        await worker(item, index);
      } catch (error) {
        onError(error, item, index);
      }
    }
  };

  await Promise.all(Array.from({ length: lanes }, lane));
};
