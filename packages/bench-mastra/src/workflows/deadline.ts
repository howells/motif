/**
 * Race an attempt against the run's shared wall-clock deadline.
 *
 * Adapted from materialdesk's `withDeadline` (`packages/mastra/src/runtime/
 * request-context.ts`, `docs/arc/bench/BRIEF.md` precedent table), with one
 * deliberate difference: materialdesk's version rethrows a `TimeoutError` and
 * lets the branch fail. `generate` must never throw — `BRIEF.md`: "one dead
 * model cannot fail the other 22" — so this resolves to a discriminated
 * `{ timedOut: true }` instead, and `generate.ts` turns that into an
 * `ExecuteFailure`-shaped `TIMEOUT` result rather than propagating an error.
 *
 * `deadlineAt` is the run-level deadline every concurrent `generate` step
 * races — its *remainder* at the moment this step starts, not a fresh
 * `fallbackMs` cap every time (`BRIEF.md`: "races the remainder of a
 * run-level deadline... not a fresh cap per step"). `fallbackMs` (a model's
 * own `perModelTimeoutMs`, `./constants.ts`) only applies when `deadlineAt`
 * is absent, which should not happen on the real path — `planRun` always
 * sets it — but keeps a work item safe if it somehow doesn't.
 */
export type DeadlineRaceOutcome<T> =
  | { readonly elapsedMs: number; readonly timedOut: true }
  | { readonly elapsedMs: number; readonly timedOut: false; readonly value: T };

export const raceDeadline = async <T>(
  work: (signal: AbortSignal) => Promise<T>,
  deadlineAt: number | undefined,
  fallbackMs: number
): Promise<DeadlineRaceOutcome<T>> => {
  const startedAt = performance.now();
  const remainingMs =
    deadlineAt === undefined
      ? fallbackMs
      : Math.max(0, deadlineAt - Date.now());
  const controller = new AbortController();
  const workPromise = work(controller.signal);

  // A rejection that arrives after the timeout has already won the race must
  // never surface as an unhandled rejection — only the race's own outcome
  // (settled below, or the propagated rejection when `work` loses the race
  // by throwing rather than timing out) reaches the caller.
  const swallowLateRejection = async (): Promise<void> => {
    try {
      await workPromise;
    } catch {
      // Intentionally ignored — see above.
    }
  };
  void swallowLateRejection();

  const settleWork = async (): Promise<DeadlineRaceOutcome<T>> => {
    const value = await workPromise;
    return { elapsedMs: performance.now() - startedAt, timedOut: false, value };
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const settleTimeout = new Promise<DeadlineRaceOutcome<T>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ elapsedMs: performance.now() - startedAt, timedOut: true });
    }, remainingMs);
  });

  try {
    return await Promise.race([settleWork(), settleTimeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};
