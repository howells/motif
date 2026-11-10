/**
 * Request bodies for video Models: Kling v3 Pro and Kling v3 Turbo Pro, which
 * take the start frame under different keys and bill by the second. What each
 * takes and charges is on its `MODELS` entry.
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { MotifError } from "./errors";
import type { TaskInput } from "./task-client";
import { invalidOption, mergeParams, refuseOthers } from "./task-plan-shared";
import type { CarriedField, PlanBody } from "./task-plan-shared";
import type { TaskId } from "./tasks";
import { projectedToolCost } from "./tool-cost";
import type { ModelConfig } from "./types";

const DEFAULT_VIDEO_SECONDS = 5;

const VIDEO_FIELDS: ReadonlySet<CarriedField> = new Set([
  "duration",
  "image",
  "prompt",
]);

/** Kling v3 Pro and Turbo Pro take `duration` as "3" to "15" seconds. */
const VIDEO_DURATIONS: ReadonlySet<string> = new Set(
  Array.from({ length: 13 }, (_, index) => String(index + 3))
);

function checkVideoDuration(
  body: Record<string, unknown>,
  model: string,
  task: TaskId
): MotifError | undefined {
  if (VIDEO_DURATIONS.has(String(body.duration))) {
    return undefined;
  }
  return invalidOption(
    `${model} takes a duration of 3 to 15 whole seconds, not ${String(body.duration)}.`,
    { field: "duration", model, task }
  );
}

export function videoPlan(
  task: TaskId,
  model: string,
  config: ModelConfig,
  input: TaskInput
): Result<PlanBody, MotifError> {
  const { price, startFrameField } = config;
  if (price === undefined || startFrameField === undefined) {
    throw new MotifError(`${model} has no start frame field or price`, 0);
  }
  const refused = refuseOthers(input, VIDEO_FIELDS, model, task);
  if (refused !== undefined) {
    return err(refused);
  }
  const owned = new Set([startFrameField, "prompt"]);
  if (input.duration !== undefined) {
    owned.add("duration");
  }
  // A Model that makes audio has it on by default, as the CLI's video path had
  // it, and is priced that way; `params: { generate_audio: false }` turns it off.
  const merged = mergeParams(
    {
      duration: String(input.duration ?? DEFAULT_VIDEO_SECONDS),
      ...(config.generatesAudio === true && { generate_audio: true }),
      prompt: input.prompt ?? "",
      [startFrameField]: input.image,
    },
    input.params,
    owned
  );
  if (merged.isErr()) {
    return err(merged.error);
  }
  const body = merged.value;
  const badDuration = checkVideoDuration(body, model, task);
  if (badDuration !== undefined) {
    return err(badDuration);
  }
  return ok({
    body,
    cost: projectedToolCost(price, body),
    endpoint: config.endpoint,
    prompt: input.prompt,
    provider: "fal",
    queued: config.useQueue === true,
  });
}
