/**
 * `persist`: hands `generate`'s outcome to the injected `PersistExecutor` and
 * returns the trimmed `PersistOutcome` that `.foreach` collects. Like
 * `generate`, this never throws on a per-item basis — a persist failure would
 * otherwise take down every other model's result in the same `.foreach`
 * batch, which is exactly what `BRIEF.md`'s error-as-data requirement is
 * protecting against.
 */
import { createStep } from "@mastra/core/workflows";

import type { PersistExecutor } from "../executors";
import { GenerateOutcomeSchema, PersistOutcomeSchema } from "./schemas";
import type { PersistOutcome } from "./schemas";

export const createPersistStep = (executor: PersistExecutor) =>
  createStep({
    description:
      "Persist one attempt's outcome via the injected PersistExecutor; never throws.",
    execute: async ({ inputData: outcome }) => {
      const result =
        outcome.status === "ok"
          ? {
              bytes: outcome.bytes,
              contentType: outcome.contentType,
              downloadMs: outcome.downloadMs,
              falRequestId: outcome.falRequestId,
              height: outcome.height,
              imagePath: `${outcome.runId}/${outcome.alias}/${outcome.sampleIndex}`,
              ok: true as const,
              providerMs: outcome.providerMs,
              seedReturned: outcome.seedReturned,
              totalMs: outcome.totalMs,
              width: outcome.width,
            }
          : {
              downloadMs: outcome.downloadMs,
              errorCode: outcome.errorCode,
              ok: false as const,
              providerMs: outcome.providerMs,
              totalMs: outcome.totalMs,
            };

      let sampleId: string;
      try {
        const persisted = await executor.persist({
          alias: outcome.alias,
          costBasis: outcome.costBasis,
          costEstimatedMicros: outcome.costEstimatedMicros,
          executionOrdinal: outcome.executionOrdinal,
          modelName: outcome.modelName,
          result,
          runId: outcome.runId,
          sampleIndex: outcome.sampleIndex,
          usesQueue: outcome.usesQueue,
        });
        sampleId = persisted.sampleId;
      } catch {
        // A persist failure must not take the whole `.foreach` batch down —
        // the attempt itself still happened (and, on success, already cost
        // money), so it is reported as a failed *persisted* sample rather
        // than thrown.
        sampleId = `unpersisted-${outcome.runId}-${outcome.alias}-${outcome.sampleIndex}`;
      }

      const persistOutcome: PersistOutcome = {
        alias: outcome.alias,
        costEstimatedMicros: outcome.costEstimatedMicros,
        costRefinedMicros:
          outcome.status === "ok" ? outcome.costRefinedMicros : null,
        downloadMs: outcome.downloadMs,
        errorCode: outcome.status === "ok" ? null : outcome.errorCode,
        executionOrdinal: outcome.executionOrdinal,
        providerMs: outcome.providerMs,
        runId: outcome.runId,
        sampleId,
        sampleIndex: outcome.sampleIndex,
        status: outcome.status === "ok" ? "completed" : "failed",
        totalMs: outcome.totalMs,
      };

      return persistOutcome;
    },
    id: "persist",
    inputSchema: GenerateOutcomeSchema,
    outputSchema: PersistOutcomeSchema,
    retries: 0,
  });
