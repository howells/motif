/**
 * Request bodies for video Models: Kling v3 Pro and Kling v3 Turbo Pro, which
 * take the start frame under different keys and bill by the second.
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { estimateVideoCost } from "./cost";
import type { MotifError } from "./errors";
import { MODELS } from "./models";
import type { TaskInput } from "./task-client";
import {
  cannotCarry,
  invalidOption,
  mergeParams,
  projected,
  refuseOthers,
  UNKNOWN_COST,
} from "./task-plan-shared";
import type { CarriedField, PlanBody } from "./task-plan-shared";
import type { TaskId } from "./tasks";

const DEFAULT_VIDEO_SECONDS = 5;

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
  model: "kling" | "kling-turbo",
  input: TaskInput
): Result<PlanBody, MotifError> {
  const config = MODELS[model];
  if (config === undefined) {
    return err(cannotCarry("model", model, task));
  }
  const refused = refuseOthers(
    input,
    new Set<CarriedField>(
      model === "kling-turbo"
        ? ["duration", "image", "prompt"]
        : ["duration", "image", "negativePrompt", "prompt"]
    ),
    model,
    task
  );
  if (refused !== undefined) {
    return err(refused);
  }
  if (model === "kling-turbo") {
    return turboVideoPlan(task, config.endpoint, input);
  }
  const owned = new Set(["prompt", "start_image_url"]);
  if (input.duration !== undefined) {
    owned.add("duration");
  }
  if (input.negativePrompt !== undefined) {
    owned.add("negative_prompt");
  }
  // generate_audio stays on by default, as the CLI's video path had it, and
  // is priced that way; `params: { generate_audio: false }` turns it off.
  const merged = mergeParams(
    {
      duration: String(input.duration ?? DEFAULT_VIDEO_SECONDS),
      generate_audio: true,
      prompt: input.prompt ?? "",
      start_image_url: input.image,
      ...(input.negativePrompt !== undefined &&
        input.negativePrompt !== "" && {
          negative_prompt: input.negativePrompt,
        }),
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
  const seconds = Number(body.duration);
  return ok({
    body,
    cost: Number.isFinite(seconds)
      ? projected(estimateVideoCost(seconds, body.generate_audio !== false))
      : UNKNOWN_COST,
    endpoint: config.endpoint,
    prompt: input.prompt,
    provider: "fal",
    queued: true,
  });
}

/**
 * Kling v3 Turbo Pro takes the start frame as `image_url` and has no audio,
 * negative prompt or end frame.
 */
function turboVideoPlan(
  task: TaskId,
  endpoint: string,
  input: TaskInput
): Result<PlanBody, MotifError> {
  const owned = new Set(["image_url", "prompt"]);
  if (input.duration !== undefined) {
    owned.add("duration");
  }
  const merged = mergeParams(
    {
      duration: String(input.duration ?? DEFAULT_VIDEO_SECONDS),
      image_url: input.image,
      prompt: input.prompt ?? "",
    },
    input.params,
    owned
  );
  if (merged.isErr()) {
    return err(merged.error);
  }
  const body = merged.value;
  const badDuration = checkVideoDuration(body, "kling-turbo", task);
  if (badDuration !== undefined) {
    return err(badDuration);
  }
  const seconds = Number(body.duration);
  return ok({
    body,
    cost: Number.isFinite(seconds)
      ? projected(estimateVideoCost(seconds, false, "kling-turbo"))
      : UNKNOWN_COST,
    endpoint,
    prompt: input.prompt,
    provider: "fal",
    queued: true,
  });
}
