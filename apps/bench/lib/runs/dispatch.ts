import { after } from "next/server";

import { runWithConcurrency } from "./pool";

/** Retain the whole pool, including settlement and finalisation, in Next's
 * response lifetime. `after` uses the host's waitUntil on Vercel; its route
 * duration still bounds execution, so hosted admission is checked separately. */
export const dispatchSamples = <T>(
  samples: readonly T[],
  concurrency: number,
  settle: (sample: T) => Promise<void>,
  label: string
): void => {
  after(async () => {
    await runWithConcurrency(samples, {
      limit: concurrency,
      onError: (error, sample) => {
        console.error(
          `[bench ${label}] settle threw — the samples behind it continue`,
          sample,
          error
        );
      },
      worker: settle,
    });
  });
};
