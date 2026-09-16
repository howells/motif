/**
 * `plan()` for the Task client: resolve the Model, build the request body the
 * Model's kind needs, and price it. Pure: no I/O.
 *
 * Every TaskInput field the chosen Model can't carry is refused with
 * `INVALID_OPTION`, never dropped, because a request that bills without the
 * option the caller asked for is worse than one that fails. Every error that
 * leaves here is a `MotifError` with a code.
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { aspectToGptSize, ImageSizeBoundsError } from "./aspects";
import { UnsupportedOptionError } from "./capabilities";
import type { ModelOption } from "./capabilities";
import { estimateVideoCost } from "./cost";
import { CreativeOptionError, enrichPrompt } from "./creative";
import type { CreativeDirection } from "./creative";
import { MotifError, toMotifError } from "./errors";
import { buildGenerateBody } from "./generate";
import { MODELS } from "./models";
import { NO_MODEL_AVAILABLE, resolveTask } from "./resolve";
import type { TaskRequest, TaskResolved } from "./resolve";
import type { PlanOptions, TaskInput, TaskPlan } from "./task-client";
import {
  checkParamsImageSize,
  generationCost,
  ownedGenerationKeys,
} from "./task-plan-pricing";
import {
  cannotCarry,
  INVALID_OPTION,
  invalidOption,
  mergeParams,
  projected,
  refuseOthers,
  UNKNOWN_COST,
} from "./task-plan-shared";
import type { CarriedField, PlanBody } from "./task-plan-shared";
import { toolPlan } from "./task-plan-tools";
import { isTaskId } from "./tasks";
import type { TaskId } from "./tasks";
import { isFalToolId } from "./tools";
import type { GenerateOptions, ModelConfig, ProviderRoute } from "./types";

export { INVALID_OPTION } from "./task-plan-shared";

/** Keys and pins the planner resolves against. */
export interface PlanContext {
  falKey?: string;
  openAiKey?: string;
  pins?: Readonly<Partial<Record<TaskId, string>>>;
}

const FLAT_PRICE_REGEX = /^\$(\d+(?:\.\d+)?)$/;

function creativeOf(input: TaskInput): CreativeDirection | undefined {
  if (input.look === undefined && input.mood === undefined) {
    return undefined;
  }
  return {
    ...(input.look !== undefined && { look: input.look }),
    ...(input.mood !== undefined && { mood: input.mood }),
  };
}

// ─── Resolution ────────────────────────────────────────────────────────

function taskRequest(task: TaskId, input: TaskInput): TaskRequest {
  const references =
    (input.references?.length ?? 0) +
    (task === "vary" && input.image !== undefined ? 1 : 0);
  let source: TaskRequest["source"];
  if (input.video !== undefined) {
    source = "video";
  } else if (input.image !== undefined) {
    source = "image";
  }
  return {
    aspect: input.aspect,
    count: input.count,
    look: task === "generate" || task === "vary" ? input.look : undefined,
    mask: input.mask !== undefined,
    mode: input.mode,
    model: input.model,
    negativePrompt: input.negativePrompt !== undefined,
    outputFormat: input.outputFormat !== undefined,
    references,
    seed: input.seed !== undefined,
    source,
    tier: input.tier,
    transparent: input.transparent,
  };
}

function resolve(
  task: TaskId,
  input: TaskInput,
  context: PlanContext,
  options: PlanOptions
): Result<TaskResolved, MotifError> {
  const keys: string[] = [];
  if (options.dryRun === true || context.falKey !== undefined) {
    keys.push("FAL_KEY");
  }
  if (context.openAiKey !== undefined) {
    keys.push("OPENAI_API_KEY");
  }
  const resolution = resolveTask(task, taskRequest(task, input), {
    keys,
    pins: context.pins,
  });
  if (resolution.ok) {
    return ok(resolution);
  }
  return err(
    new MotifError(resolution.message, 0, NO_MODEL_AVAILABLE, undefined, {
      blockedBy: resolution.blockedBy,
      task,
      unblockedBy: resolution.unblockedBy,
      ...(resolution.missingKey !== undefined && {
        missingKey: resolution.missingKey,
      }),
    })
  );
}

// ─── Plan ──────────────────────────────────────────────────────────────

export function planTask(
  task: TaskId,
  input: TaskInput,
  context: PlanContext,
  options: PlanOptions = {}
): Result<TaskPlan, MotifError> {
  if (!isTaskId(task)) {
    return err(
      invalidOption(`Unknown Task: ${String(task)}.`, { field: "task" })
    );
  }
  if (input.params !== undefined && (input.model ?? "") === "") {
    return err(
      invalidOption("params are Model-only fields and need a model.", {
        field: "params",
        requires: "model",
      })
    );
  }
  if (input.image !== undefined && input.video !== undefined) {
    return err(
      invalidOption("Pass an image or a video, not both.", {
        field: "video",
        task,
      })
    );
  }
  if (
    task !== "generate" &&
    input.image === undefined &&
    input.video === undefined
  ) {
    return err(
      invalidOption(`${task} needs a source image.`, { field: "image", task })
    );
  }

  const resolved = resolve(task, input, context, options);
  if (resolved.isErr()) {
    return err(resolved.error);
  }
  const { chosenBy, model, tier } = resolved.value;

  let built: Result<PlanBody, MotifError>;
  try {
    built = planBody(task, model, input);
  } catch (error) {
    built = err(withCode(error, model, task));
  }
  if (built.isErr()) {
    return err(built.error);
  }
  return ok({
    ...built.value,
    chosenBy,
    model,
    ...(input.mode !== undefined && { mode: input.mode }),
    task,
    tier,
  });
}

/** A thrown value as a `MotifError` that always carries a code. */
function withCode(error: unknown, model: string, task: TaskId): MotifError {
  if (error instanceof CreativeOptionError) {
    return invalidOption(error.message, {
      available: error.availableIds,
      field: error.field,
      task,
    });
  }
  const motif = toMotifError(error);
  if (motif.code !== undefined) {
    return motif;
  }
  return new MotifError(motif.message, 0, INVALID_OPTION, undefined, {
    model,
    task,
  });
}

function planBody(
  task: TaskId,
  model: string,
  input: TaskInput
): Result<PlanBody, MotifError> {
  if (isFalToolId(model)) {
    return toolPlan(task, model, input);
  }
  const config = MODELS[model];
  if (config?.type === "generation") {
    return generationPlan(task, model, config, input);
  }
  if (model === "clarity" || model === "crystal") {
    return upscalerPlan(task, model, input);
  }
  if (model === "kling") {
    return videoPlan(task, model, input);
  }
  return err(
    invalidOption(`No request builder for Model ${model} on ${task}.`, {
      field: "model",
      model,
      task,
    })
  );
}

// ─── Generation Models ─────────────────────────────────────────────────

const GENERATION_FIELDS: ReadonlySet<CarriedField> = new Set([
  "aspect",
  "count",
  "look",
  "mask",
  "mood",
  "negativePrompt",
  "outputFormat",
  "prompt",
  "references",
  "resolution",
  "seed",
  "transparent",
]);

/** The TaskInput field behind each option `buildGenerateBody` can refuse. */
const FIELD_FOR_OPTION: Partial<Record<ModelOption, CarriedField>> = {
  aspect: "aspect",
  background: "transparent",
  "image editing": "references",
  maskImageUrl: "mask",
  negativePrompt: "negativePrompt",
  numImages: "count",
  outputFormat: "outputFormat",
  resolution: "resolution",
  seed: "seed",
  "transparent output": "transparent",
};

function generationError(
  error: unknown,
  model: string,
  task: TaskId
): MotifError {
  if (error instanceof UnsupportedOptionError) {
    return invalidOption(error.message, {
      field: FIELD_FOR_OPTION[error.option] ?? error.option,
      model,
      task,
    });
  }
  if (error instanceof ImageSizeBoundsError) {
    return invalidOption(error.message, {
      bounds: error.bounds,
      field: "aspect",
      model,
      task,
    });
  }
  return withCode(error, model, task);
}

function generationPlan(
  task: TaskId,
  model: string,
  config: ModelConfig,
  input: TaskInput
): Result<PlanBody, MotifError> {
  const allowed = new Set(GENERATION_FIELDS);
  if (task === "vary") {
    allowed.add("image");
  }
  const refused = refuseOthers(input, allowed, model, task);
  if (refused !== undefined) {
    return err(refused);
  }
  if (task === "generate" && (input.prompt ?? "") === "") {
    return err(
      invalidOption("generate needs a prompt.", { field: "prompt", task })
    );
  }
  const editImageUrls = [
    ...(task === "vary" && input.image !== undefined ? [input.image] : []),
    ...(input.references ?? []),
  ];
  if (input.mask !== undefined && editImageUrls.length === 0) {
    return err(
      invalidOption("A mask applies to a reference image; pass references.", {
        field: "mask",
        requires: "references",
      })
    );
  }
  if (
    input.transparent === true &&
    config.supportsBackground !== true &&
    config.transparencyRoute !== undefined
  ) {
    return openAiPlan(
      task,
      model,
      config.transparencyRoute,
      input,
      editImageUrls
    );
  }
  if (
    input.outputFormat !== undefined &&
    config.supportedOutputFormats !== undefined &&
    !config.supportedOutputFormats.includes(input.outputFormat)
  ) {
    return err(cannotCarry("outputFormat", model, task));
  }

  const options: GenerateOptions = {
    aspect: input.aspect,
    background: input.transparent === true ? "transparent" : undefined,
    creative: creativeOf(input),
    editImageUrls: editImageUrls.length > 0 ? editImageUrls : undefined,
    maskImageUrl: input.mask,
    model,
    negativePrompt: input.negativePrompt,
    numImages: input.count,
    outputFormat: input.outputFormat,
    prompt: input.prompt ?? "",
    resolution: input.resolution,
    seed: input.seed,
  };
  let built: ReturnType<typeof buildGenerateBody>;
  try {
    built = buildGenerateBody(options);
  } catch (error) {
    return err(generationError(error, model, task));
  }
  const merged = mergeParams(
    built.body,
    input.params,
    ownedGenerationKeys(input)
  );
  if (merged.isErr()) {
    return err(merged.error);
  }
  const badSize = checkParamsImageSize(config, model, task, input.params);
  if (badSize !== undefined) {
    return err(badSize);
  }
  return ok({
    body: merged.value,
    cost: generationCost(model, config, merged.value),
    endpoint: built.endpoint,
    prompt:
      typeof built.body.prompt === "string" ? built.body.prompt : undefined,
    provider: "fal",
    queued: config.useQueue === true,
  });
}

/**
 * The OpenAI transparency route. Ported from the CLI's generate-openai: the
 * route carries only what gpt-image takes, so everything else is refused.
 */
function openAiPlan(
  task: TaskId,
  model: string,
  route: ProviderRoute,
  input: TaskInput,
  editImageUrls: readonly string[]
): Result<PlanBody, MotifError> {
  const allowed = new Set<CarriedField>([
    "aspect",
    "count",
    "look",
    "mask",
    "mood",
    "prompt",
    "references",
    "transparent",
  ]);
  if (task === "vary") {
    allowed.add("image");
  }
  if (input.outputFormat === "png") {
    allowed.add("outputFormat");
  }
  const refused = refuseOthers(input, allowed, model, task);
  if (refused !== undefined) {
    return err(refused);
  }
  if (input.params !== undefined) {
    return err(cannotCarry("params", model, task));
  }
  const editing = editImageUrls.length > 0;
  if (editing && !route.supportsEdit) {
    return err(cannotCarry("references", model, task));
  }

  let prompt: string;
  try {
    const creative = creativeOf(input);
    prompt =
      creative === undefined
        ? (input.prompt ?? "")
        : enrichPrompt({ creative, prompt: input.prompt ?? "" }).prompt;
  } catch (error) {
    return err(withCode(error, model, task));
  }

  return ok({
    body: {
      n: input.count ?? 1,
      prompt,
      size: aspectToGptSize(input.aspect ?? "1:1"),
      ...(editing && { images: [...editImageUrls] }),
      ...(input.mask !== undefined && { mask: input.mask }),
      background: "transparent",
      outputFormat: "png",
    },
    // OpenAI bills gpt-image by tokens and publishes no per-image price.
    cost: UNKNOWN_COST,
    endpoint: `${route.provider}:${route.model}`,
    prompt,
    provider: "openai",
    queued: false,
  });
}

// ─── Upscalers and video ───────────────────────────────────────────────

function flatPrice(pricing: string): number | null {
  const match = FLAT_PRICE_REGEX.exec(pricing.trim());
  return match === null ? null : Number(match[1]);
}

function upscalerPlan(
  task: TaskId,
  model: "clarity" | "crystal",
  input: TaskInput
): Result<PlanBody, MotifError> {
  const config = MODELS[model];
  if (config === undefined) {
    return err(cannotCarry("model", model, task));
  }
  const allowed = new Set<CarriedField>(
    model === "clarity"
      ? ["image", "negativePrompt", "prompt", "scale"]
      : ["image", "scale"]
  );
  const refused = refuseOthers(input, allowed, model, task);
  if (refused !== undefined) {
    return err(refused);
  }
  const body: Record<string, unknown> = { image_url: input.image };
  if (input.scale !== undefined) {
    body[model === "crystal" ? "scale_factor" : "upscale_factor"] = input.scale;
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
  return ok({
    body: merged.value,
    cost: projected(flatPrice(config.pricing)),
    endpoint: config.endpoint,
    prompt: input.prompt,
    provider: "fal",
    queued: false,
  });
}

const DEFAULT_VIDEO_SECONDS = 5;

function videoPlan(
  task: TaskId,
  model: "kling",
  input: TaskInput
): Result<PlanBody, MotifError> {
  const config = MODELS[model];
  if (config === undefined) {
    return err(cannotCarry("model", model, task));
  }
  const refused = refuseOthers(
    input,
    new Set<CarriedField>(["duration", "image", "negativePrompt", "prompt"]),
    model,
    task
  );
  if (refused !== undefined) {
    return err(refused);
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
