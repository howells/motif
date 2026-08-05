/**
 * Observability wiring for the benchmark harness.
 *
 * `createLangfuseObservability` resolves to a Langfuse exporter when
 * credentials are present, and otherwise falls back to Mastra's storage
 * exporter (`storageFallback` defaults to `true`) — so every run is traced
 * into Postgres (`mastra_ai_spans`, readable from Studio) even without
 * Langfuse configured. `failFastInProd: false` matches the harness rather
 * than a user-facing product: a missing Langfuse key should never abort a
 * paid benchmark run, it should just downgrade to storage-only tracing.
 *
 * Precedent: `materialdesk/packages/mastra/src/observability.ts`
 * (`docs/arc/bench/BRIEF.md` precedent table).
 */
import { createMastraLogger } from "@howells/mastra/observability";
import { createLangfuseObservability } from "@howells/mastra/observability/langfuse";
import type { Mastra } from "@mastra/core";

export const observability = createLangfuseObservability({
  failFastInProd: false,
  serviceName: "motif-bench",
});

export const logger = createMastraLogger({ name: "motif-bench" });

/**
 * Flush every registered observability exporter without tearing the
 * instance down. `@mastra/core` / `@mastra/observability`: the
 * non-destructive flush is `mastra.observability.flush()` — `shutdown()`
 * tears down the module-cached singleton, which this long-lived process (and
 * any hot-reloaded dev server) reuses across runs.
 */
const flushObservability = async (mastra: Mastra): Promise<void> => {
  await mastra.observability.flush();
};

/**
 * Guarded flush — never throws, so callers can run it in `finally` (or
 * fire-and-forget) without masking the run's real outcome. `tag` prefixes the
 * debug log so a failed flush names its caller.
 *
 * Never call `mastra.observability.shutdown()` from bench-mastra: it would
 * tear down tracing for every subsequent run sharing this process.
 */
export const guardedFlush = async (
  mastra: Mastra,
  tag: string
): Promise<void> => {
  try {
    await flushObservability(mastra);
  } catch (flushError) {
    mastra.getLogger().debug(`${tag} trace flush failed`, { flushError });
  }
};
