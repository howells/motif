/**
 * Starting runs: validate, plan, bound and reserve, in that order. Nothing is
 * reserved for a request that can't be bounded, and nothing reaches the
 * provider until its reservation is written.
 */
import type { AppSql } from "@motif/bench-db/app-sql";

import type { Member } from "../auth/members";
import { MAX_COMPARISON_MODELS } from "../budget/policy";
import { newId } from "../ids";
import { quote, resolveOwnedInputs } from "./plan";
import type { Alternative } from "./plan";
import { TaskRequestSchema, promptOf } from "./request";
import type { APP_ASPECTS, AppTaskRequest } from "./request";
import { reserveRuns } from "./store";
import type { Generation, PlannedComparison, PlannedRun } from "./store";

export type StartResult =
  | {
      readonly kind: "started";
      readonly generationIds: readonly string[];
      readonly comparisonId?: string;
    }
  | { readonly kind: "duplicate"; readonly generationIds: readonly string[] }
  | {
      readonly kind: "refused";
      readonly status: number;
      readonly code: string;
      readonly message: string;
      readonly details?: Record<string, unknown>;
    };

interface Lineage {
  readonly comparisonId: string | null;
  readonly parentId: string | null;
  readonly retryOf: string | null;
  readonly stackId: string | null;
}

const NEW_LINEAGE: Lineage = {
  comparisonId: null,
  parentId: null,
  retryOf: null,
  stackId: null,
};

const plannedRun = async (
  sql: AppSql,
  member: Member,
  request: AppTaskRequest,
  idempotencyKey: string,
  lineage: Lineage
): Promise<
  | { readonly ok: true; readonly run: PlannedRun }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: string;
      readonly message: string;
      readonly details?: Record<string, unknown>;
    }
> => {
  const inputs = await resolveOwnedInputs(sql, member, request);
  if (!inputs.ok) {
    return inputs;
  }
  const quoted = quote(request, inputs);
  if (quoted.kind === "invalid") {
    return {
      code: "UNSUPPORTED_REQUEST",
      message: quoted.message,
      ok: false,
      status: 400,
    };
  }
  if (quoted.kind === "blocked") {
    return {
      code: "NO_PRICE_LIMIT",
      details: {
        alternatives: quoted.alternatives satisfies readonly Alternative[],
        model: quoted.plan.model,
      },
      message: quoted.reason,
      ok: false,
      status: 409,
    };
  }
  const id = newId("gen");
  const { plan } = quoted;
  return {
    ok: true,
    run: {
      boundMicros: quoted.bound.micros,
      comparisonId: lineage.comparisonId,
      endpoint: plan.endpoint,
      holdId: newId("hld"),
      id,
      idempotencyKey,
      // The Model is pinned so the worker runs exactly what was priced.
      input: { ...request, model: plan.model },
      maskAssetId: inputs.mask?.id ?? null,
      mode: plan.mode ?? null,
      model: plan.model,
      ownerId: member.id,
      parentId: lineage.parentId ?? inputs.parent?.id ?? null,
      prompt: promptOf(request),
      referenceAssetIds: inputs.references.map((asset) => asset.id),
      retryOf: lineage.retryOf,
      sourceAssetId: inputs.source?.id ?? null,
      stackId: lineage.stackId ?? inputs.parent?.stackId ?? id,
      task: request.task,
      tier: plan.tier,
    },
  };
};

const capRefusal = (
  availableMicros: number,
  requestedMicros: number
): StartResult => ({
  code: "CAP_REACHED",
  details: { availableMicros, requestedMicros },
  kind: "refused",
  message: "This would go past the shared monthly cap, so it hasn't started.",
  status: 402,
});

export const startRun = async (
  sql: AppSql,
  member: Member,
  request: AppTaskRequest
): Promise<StartResult> => {
  const planned = await plannedRun(
    sql,
    member,
    request,
    request.idempotencyKey,
    NEW_LINEAGE
  );
  if (!planned.ok) {
    return { ...planned, kind: "refused" };
  }
  const reserved = await reserveRuns(sql, [planned.run], null);
  if (reserved.kind === "cap") {
    return capRefusal(reserved.availableMicros, reserved.requestedMicros);
  }
  return reserved.kind === "duplicate"
    ? { generationIds: reserved.generationIds, kind: "duplicate" }
    : { generationIds: reserved.generationIds, kind: "started" };
};

/** Run a failed or unconfirmed Generation again: a new run with a new hold,
 * in the same stack, with the same Model. */
export const retryRun = async (
  sql: AppSql,
  member: Member,
  failed: Generation,
  idempotencyKey: string
): Promise<StartResult> => {
  if (failed.status !== "failed" && failed.status !== "unknown") {
    return {
      code: "NOT_RETRYABLE",
      kind: "refused",
      message: "Only a run that failed or never confirmed can be tried again.",
      status: 409,
    };
  }
  const request = { ...failed.input, idempotencyKey, model: failed.model };
  const parsed = TaskRequestSchema.safeParse(request);
  if (!parsed.success) {
    return {
      code: "UNSUPPORTED_REQUEST",
      kind: "refused",
      message: "That run can't be repeated.",
      status: 400,
    };
  }
  const planned = await plannedRun(sql, member, parsed.data, idempotencyKey, {
    comparisonId: failed.comparisonId,
    parentId: failed.parentId,
    retryOf: failed.id,
    stackId: failed.stackId,
  });
  if (!planned.ok) {
    return { ...planned, kind: "refused" };
  }
  const reserved = await reserveRuns(sql, [planned.run], null);
  if (reserved.kind === "cap") {
    return capRefusal(reserved.availableMicros, reserved.requestedMicros);
  }
  return reserved.kind === "duplicate"
    ? { generationIds: reserved.generationIds, kind: "duplicate" }
    : { generationIds: reserved.generationIds, kind: "started" };
};

export interface ComparisonRequest {
  readonly aspect?: (typeof APP_ASPECTS)[number];
  readonly idempotencyKey: string;
  readonly look?: string;
  readonly mood?: string;
  readonly models: readonly string[];
  readonly prompt: string;
}

/** One prompt to several Models. Every Model must have a ceiling, and every
 * hold is reserved together, before any Model starts. */
export const startComparison = async (
  sql: AppSql,
  member: Member,
  comparison: ComparisonRequest
): Promise<StartResult> => {
  const models = [...new Set(comparison.models)];
  if (models.length < 2 || models.length > MAX_COMPARISON_MODELS) {
    return {
      code: "MODEL_COUNT",
      kind: "refused",
      message: `Choose between 2 and ${MAX_COMPARISON_MODELS} Models.`,
      status: 400,
    };
  }
  const comparisonId = newId("cmp");
  const planned = await Promise.all(
    models.map(async (model) => {
      const request: AppTaskRequest = {
        count: 1,
        idempotencyKey: comparison.idempotencyKey,
        model,
        prompt: comparison.prompt,
        referenceAssetIds: [],
        task: "generate",
        ...(comparison.aspect !== undefined && { aspect: comparison.aspect }),
        ...(comparison.look !== undefined && { look: comparison.look }),
        ...(comparison.mood !== undefined && { mood: comparison.mood }),
      };
      const result = await plannedRun(
        sql,
        member,
        request,
        `${comparison.idempotencyKey}:${model}`,
        { ...NEW_LINEAGE, comparisonId }
      );
      return { model, result };
    })
  );
  const runs: PlannedRun[] = [];
  const refusals: { model: string; message: string }[] = [];
  for (const { model, result } of planned) {
    if (result.ok) {
      runs.push(result.run);
    } else {
      refusals.push({ message: result.message, model });
    }
  }
  if (refusals.length > 0) {
    return {
      code: "MODEL_REFUSED",
      details: { refusals },
      kind: "refused",
      message:
        "Some of those Models can't be held against the cap, so nothing has started.",
      status: 409,
    };
  }
  const record: PlannedComparison = {
    id: comparisonId,
    input: {
      aspect: comparison.aspect ?? null,
      look: comparison.look ?? null,
      mood: comparison.mood ?? null,
    },
    models,
    ownerId: member.id,
    prompt: comparison.prompt,
  };
  const reserved = await reserveRuns(sql, runs, record);
  if (reserved.kind === "cap") {
    return capRefusal(reserved.availableMicros, reserved.requestedMicros);
  }
  return reserved.kind === "duplicate"
    ? { generationIds: reserved.generationIds, kind: "duplicate" }
    : { comparisonId, generationIds: reserved.generationIds, kind: "started" };
};
