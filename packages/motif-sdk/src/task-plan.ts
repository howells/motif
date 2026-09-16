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
import { CreativeOptionError, enrichPrompt } from "./creative";
import type { CreativeDirection } from "./creative";
import { MotifError, toMotifError } from "./errors";
import { buildGenerateBody } from "./generate";
import { MODELS } from "./models";
import { NO_MODEL_AVAILABLE, resolveTask } from "./resolve";
import type { TaskRequest, TaskResolved } from "./resolve";
import { dataUrlImageSize } from "./source-size";
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
import { videoPlan } from "./task-plan-video";
import { isTaskId, TASKS } from "./tasks";
import type { RankedModel, TaskId } from "./tasks";
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
const MEGAPIXEL_PRICE_REGEX = /^\$(\d+(?:\.\d+)?)\/MP$/;

/** Clarity's own default factor, from fal's schema. */
const CLARITY_DEFAULT_SCALE = 2;

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
    // 2K is every generation Model's default size, so it asks for nothing.
    resolution:
      (task === "generate" || task === "vary") && input.resolution === "2K"
        ? undefined
        : input.resolution,
    rig: input.rig,
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
  if (options.dryRun === true || context.openAiKey !== undefined) {
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
  const refusedInput = taskInputRefusal(task, input);
  if (refusedInput !== undefined) {
    return err(refusedInput);
  }

  const resolved = resolve(task, input, context, options);
  if (resolved.isErr()) {
    return err(resolved.error);
  }
  const { chosenBy, model, tier } = resolved.value;
  const noSource = missingSource(task, model, input);
  if (noSource !== undefined) {
    return err(noSource);
  }

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

/** Refuse a request with no Source unless the chosen Model works without one. */
function missingSource(
  task: TaskId,
  model: string,
  input: TaskInput
): MotifError | undefined {
  if (
    task === "generate" ||
    input.image !== undefined ||
    input.video !== undefined
  ) {
    return undefined;
  }
  const entries: readonly RankedModel[] = TASKS[task].models;
  const entry = entries.find(
    (candidate) => candidate.model === model && candidate.mode === input.mode
  );
  return entry?.sourceOptional === true
    ? undefined
    : invalidOption(`${task} needs a source image.`, { field: "image", task });
}

/** Tasks that take their Source and exactly one Reference. */
const ONE_REFERENCE_TASKS: ReadonlySet<TaskId> = new Set<TaskId>([
  "restyle",
  "try-on",
]);

/** Refusals a Task makes whatever Model it resolves to. */
function taskInputRefusal(
  task: TaskId,
  input: TaskInput
): MotifError | undefined {
  if (ONE_REFERENCE_TASKS.has(task) && input.references?.length !== 1) {
    return invalidOption(`${task} takes exactly one reference image.`, {
      field: "references",
      task,
    });
  }
  const described = (input.prompt ?? "") !== "" || (input.mood ?? "") !== "";
  if (task === "relight" && input.mode === undefined && !described) {
    return invalidOption(
      "relight needs a prompt describing the light, or a mood.",
      { field: "prompt", task }
    );
  }
  return undefined;
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
  if (model === "kling" || model === "kling-turbo") {
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

/**
 * `vary` carries no prompt of its own: the image is the whole instruction.
 * Every generation Model still needs words, and an empty string is refused
 * upstream, so ask for the picture again and let the Model's own variance
 * do the work.
 */
const VARY_PROMPT =
  "Another take of this image: the same subject, framing, palette and light, rendered afresh.";

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
    prompt:
      task === "vary" && (input.prompt ?? "") === ""
        ? VARY_PROMPT
        : (input.prompt ?? ""),
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

// ─── Upscalers ─────────────────────────────────────────────────────────

function flatPrice(pricing: string): number | null {
  const match = FLAT_PRICE_REGEX.exec(pricing.trim());
  return match === null ? null : Number(match[1]);
}

/**
 * An upscaler's price: flat, or per megapixel of output, which is the source's
 * megapixels times the factor squared. Unknown without the source's size.
 */
function upscalerCost(
  pricing: string,
  input: TaskInput,
  scale: number
): number | null {
  const perMegapixel = MEGAPIXEL_PRICE_REGEX.exec(pricing.trim());
  if (perMegapixel === null) {
    return flatPrice(pricing);
  }
  const size =
    (input.image === undefined ? undefined : dataUrlImageSize(input.image)) ??
    input.sourceSize;
  return size === undefined
    ? null
    : (Number(perMegapixel[1]) * size.width * size.height * scale * scale) /
        1_000_000;
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
    cost: projected(
      upscalerCost(
        config.pricing,
        input,
        typeof merged.value.upscale_factor === "number"
          ? merged.value.upscale_factor
          : CLARITY_DEFAULT_SCALE
      )
    ),
    endpoint: config.endpoint,
    prompt: input.prompt,
    provider: "fal",
    queued: false,
  });
}
