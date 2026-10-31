/**
 * What the browser is told about a Generation. Media is named by same-origin
 * URLs the media route checks; provider URLs, request bodies and Blob paths
 * never leave the server.
 */
import type { StackSummary } from "./library/queries";
import type { Generation } from "./tasks/store";

export const mediaUrl = (assetId: string): string =>
  `/api/app/media/${assetId}`;

export interface GenerationView {
  readonly boundMicros: number;
  readonly comparisonId: string | null;
  readonly completedAt: string | null;
  readonly costBasis: string | null;
  readonly costMicros: number | null;
  readonly costStatus: Generation["costStatus"];
  readonly createdAt: string;
  readonly elapsedMs: number | null;
  readonly error: { readonly code: string; readonly message: string } | null;
  readonly id: string;
  readonly input: Record<string, unknown>;
  readonly mode: string | null;
  readonly model: string;
  readonly outputs: readonly {
    readonly assetId: string;
    readonly url: string;
  }[];
  readonly parentId: string | null;
  readonly prompt: string | null;
  readonly requestRef: string | null;
  readonly retryOf: string | null;
  readonly sourceAssetId: string | null;
  readonly stackId: string;
  readonly status: Generation["status"];
  readonly submittedAt: string | null;
  readonly task: string;
  readonly tier: string;
}

/** A short form of the provider request id, enough to quote to fal support. */
const shortRef = (requestId: string | null): string | null =>
  requestId === null ? null : `${requestId.slice(0, 4)}…${requestId.slice(-4)}`;

const sanitisedInput = (
  input: Record<string, unknown>
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "idempotencyKey")
  );

export const generationView = (generation: Generation): GenerationView => ({
  boundMicros: generation.boundMicros,
  comparisonId: generation.comparisonId,
  completedAt: generation.completedAt?.toISOString() ?? null,
  costBasis: generation.costBasis,
  costMicros: generation.costMicros,
  costStatus: generation.costStatus,
  createdAt: generation.createdAt.toISOString(),
  elapsedMs: generation.providerMs,
  error:
    generation.errorCode === null
      ? null
      : {
          code: generation.errorCode,
          message: generation.errorMessage ?? "The run failed.",
        },
  id: generation.id,
  input: sanitisedInput(generation.input),
  mode: generation.mode,
  model: generation.model,
  outputs: generation.outputAssetIds.map((assetId) => ({
    assetId,
    url: mediaUrl(assetId),
  })),
  parentId: generation.parentId,
  prompt: generation.prompt,
  requestRef: shortRef(generation.requestId),
  retryOf: generation.retryOf,
  sourceAssetId: generation.sourceAssetId,
  stackId: generation.stackId,
  status: generation.status,
  submittedAt: generation.submittedAt?.toISOString() ?? null,
  task: generation.task,
  tier: generation.tier,
});

export interface StackView {
  readonly comparisonId: string | null;
  readonly completedAt: string;
  readonly costMicros: number;
  readonly cover: { readonly assetId: string; readonly url: string } | null;
  readonly latestId: string;
  readonly model: string;
  readonly prompt: string | null;
  readonly stackId: string;
  readonly task: string;
  readonly versions: number;
}

export const stackView = (stack: StackSummary): StackView => {
  const first = stack.outputAssetIds[0];
  return {
    comparisonId: stack.comparisonId,
    completedAt: stack.completedAt.toISOString(),
    costMicros: stack.costMicros,
    cover:
      first === undefined ? null : { assetId: first, url: mediaUrl(first) },
    latestId: stack.latestId,
    model: stack.model,
    prompt: stack.prompt,
    stackId: stack.stackId,
    task: stack.task,
    versions: stack.versions,
  };
};
