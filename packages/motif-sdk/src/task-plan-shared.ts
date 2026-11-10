/**
 * Helpers every request builder in the Task planner shares: refusing fields a
 * Model can't carry, and merging `params` without letting them replace what
 * the plan set.
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { MotifError } from "./errors";
import { dataUrlImageSize } from "./source-size";
import type { TaskInput, TaskPlan } from "./task-client";
import type { TaskId } from "./tasks";
import type { ResolvedCost } from "./tool-cost";
import type { CustomImageSize } from "./types";

export const INVALID_OPTION = "INVALID_OPTION";

/** TaskInput fields that carry request content, in the order they are checked. */
export const CARRIED_FIELDS = [
  "image",
  "video",
  "prompt",
  "mask",
  "markup",
  "references",
  "boxes",
  "margin",
  "aspect",
  "resolution",
  "count",
  "seed",
  "negativePrompt",
  "outputFormat",
  "transparent",
  "scale",
  "sizes",
  "duration",
  "rig",
  "look",
  "mood",
] as const satisfies readonly (keyof TaskInput)[];

export type CarriedField = (typeof CARRIED_FIELDS)[number];

/** What each request builder returns; `planTask` adds the resolution. */
export type PlanBody = Pick<
  TaskPlan,
  "body" | "cost" | "endpoint" | "prompt" | "provider" | "queued"
>;

export const UNKNOWN_COST: ResolvedCost = { basis: "unknown", usd: null };

export function projected(usd: number | null): ResolvedCost {
  return usd === null ? UNKNOWN_COST : { basis: "projected", usd };
}

export function invalidOption(
  message: string,
  details: Record<string, unknown>
): MotifError {
  return new MotifError(message, 0, INVALID_OPTION, undefined, details);
}

export function cannotCarry(
  field: string,
  model: string,
  task: TaskId
): MotifError {
  return invalidOption(`${model} cannot take ${field} for ${task}.`, {
    field,
    model,
    task,
  });
}

/**
 * A scale that no endpoint takes (zero, negative, not a number) or that the
 * endpoint's record lists no such value for. `accepted` is the record's enum,
 * absent where the record says only `number`: no limit is invented for those.
 */
export function scaleRefusal(
  task: TaskId,
  model: string,
  scale: number,
  accepted: readonly number[] = []
): MotifError | undefined {
  if (!Number.isFinite(scale) || scale <= 0) {
    return invalidOption(`scale must be a positive number, not ${scale}.`, {
      field: "scale",
      model,
      task,
    });
  }
  if (accepted.length > 0 && !accepted.includes(scale)) {
    return invalidOption(
      `${model} cannot take scale ${scale} for ${task}; it takes ${accepted.join(", ")}.`,
      { accepts: accepted, field: "scale", model, task }
    );
  }
  return undefined;
}

export function isPresent(input: TaskInput, field: CarriedField): boolean {
  const value = input[field];
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== undefined;
}

/** Refuse the first present field outside `allowed`. */
export function refuseOthers(
  input: TaskInput,
  allowed: ReadonlySet<CarriedField>,
  model: string,
  task: TaskId
): MotifError | undefined {
  const field = CARRIED_FIELDS.find(
    (candidate) => isPresent(input, candidate) && !allowed.has(candidate)
  );
  return field === undefined ? undefined : cannotCarry(field, model, task);
}

/** Source, mask and reference URL fields: never settable through `params`. */
const URL_KEY_REGEX = /_urls?$/;

/**
 * `params` over `body`. A key the plan set from the caller's input, or any
 * URL field, is refused: `params` adds Model-only fields, it does not replace
 * the source, the mask or an option the request already carries. Keys that
 * hold only Motif's defaults may be overridden.
 */
export function mergeParams(
  body: Record<string, unknown>,
  params: TaskInput["params"],
  owned: ReadonlySet<string>
): Result<Record<string, unknown>, MotifError> {
  if (params === undefined) {
    return ok(body);
  }
  for (const key of Object.keys(params)) {
    if (URL_KEY_REGEX.test(key) || owned.has(key)) {
      return err(
        invalidOption(
          `params.${key} would replace a field the request already sets.`,
          { field: "params", key }
        )
      );
    }
  }
  return ok({ ...body, ...params });
}

/** An exact `{ width, height }` in pixels. */
export function isCustomSize(value: unknown): value is CustomImageSize {
  return (
    typeof value === "object" &&
    value !== null &&
    "width" in value &&
    "height" in value &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
}

/** The source's pixel size: read from a data URL, else the caller's `sourceSize`. */
export function sourceSizeOf(input: TaskInput): CustomImageSize | undefined {
  const fromData =
    input.image === undefined ? undefined : dataUrlImageSize(input.image);
  return fromData ?? input.sourceSize;
}
