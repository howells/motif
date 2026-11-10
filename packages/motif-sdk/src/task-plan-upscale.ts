/**
 * Request bodies for the upscaler Models, Clarity and Crystal. What each takes
 * and charges is on its `MODELS` entry.
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { MotifError } from "./errors";
import type { TaskInput } from "./task-client";
import {
  mergeParams,
  paramScaleRefusal,
  refuseOthers,
  scaleRefusal,
  sourceSizeOf,
} from "./task-plan-shared";
import type { CarriedField, PlanBody } from "./task-plan-shared";
import type { TaskId } from "./tasks";
import { projectedToolCost } from "./tool-cost";
import type { ModelConfig } from "./types";

export function upscalerPlan(
  task: TaskId,
  model: string,
  config: ModelConfig,
  input: TaskInput
): Result<PlanBody, MotifError> {
  const { price, scaleField } = config;
  if (price === undefined || scaleField === undefined) {
    throw new MotifError(`${model} has no scale field or price`, 0);
  }
  const allowed = new Set<CarriedField>(["image", "scale"]);
  if (config.supportsPrompt === true) {
    allowed.add("negativePrompt");
    allowed.add("prompt");
  }
  const refused = refuseOthers(input, allowed, model, task);
  if (refused !== undefined) {
    return err(refused);
  }
  const body: Record<string, unknown> = { image_url: input.image };
  if (input.scale !== undefined) {
    const badScale = scaleRefusal(task, model, input.scale, {
      range: config.scaleRange,
    });
    if (badScale !== undefined) {
      return err(badScale);
    }
    body[scaleField] = input.scale;
  }
  if (input.prompt !== undefined && input.prompt !== "") {
    body.prompt = input.prompt;
  }
  if (input.negativePrompt !== undefined && input.negativePrompt !== "") {
    body.negative_prompt = input.negativePrompt;
  }
  const merged = mergeParams(body, input.params, new Set(Object.keys(body)));
  if (merged.isErr()) {
    return err(merged.error);
  }
  const badParamScale = paramScaleRefusal(
    task,
    model,
    scaleField,
    input.params,
    config.scaleRange
  );
  if (badParamScale !== undefined) {
    return err(badParamScale);
  }
  // A per-megapixel rate bills the output: the source's size times the factor.
  const factor = merged.value[scaleField];
  const scale = typeof factor === "number" ? factor : config.defaultScale;
  const size = sourceSizeOf(input);
  const outputs =
    size === undefined || scale === undefined
      ? []
      : [{ height: size.height * scale, width: size.width * scale }];
  return ok({
    body: merged.value,
    cost: projectedToolCost(price, merged.value, outputs),
    endpoint: config.endpoint,
    prompt: input.prompt,
    provider: "fal",
    queued: config.useQueue === true,
  });
}
