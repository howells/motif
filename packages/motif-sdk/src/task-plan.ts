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

import {
  DEFAULT_GENERATION_RESOLUTION,
  ImageSizeBoundsError,
  requestedSize,
} from "./aspects";
import {
  OPAQUE_OUTPUT_FORMATS,
  outputFormatsOf,
  UnsupportedOptionError,
} from "./capabilities";
import type { ModelOption } from "./capabilities";
import { CreativeOptionError } from "./creative";
import type { CreativeDirection } from "./creative";
import { MotifError, toMotifError } from "./errors";
import { aspectFromSource, buildGenerateBody } from "./generate";
import { MODELS } from "./models";
import { NO_MODEL_AVAILABLE, resolveTask } from "./resolve";
import type { TaskRequest, TaskResolved } from "./resolve";
import { dataUrlImageSize } from "./source-size";
import type { PlanOptions, TaskInput, TaskPlan } from "./task-client";
import { generationParamsRefusal } from "./task-plan-params";
import { generationCost, ownedGenerationKeys } from "./task-plan-pricing";
import {
  cannotCarry,
  INVALID_OPTION,
  invalidOption,
  mergeParams,
  refuseOthers,
} from "./task-plan-shared";
import type { CarriedField, PlanBody } from "./task-plan-shared";
import { toolPlan } from "./task-plan-tools";
import { upscalerPlan } from "./task-plan-upscale";
import { videoPlan } from "./task-plan-video";
import { isTaskId, TASKS } from "./tasks";
import type { RankedModel, TaskDefinition, TaskId } from "./tasks";
import { isFalToolId } from "./tools";
import type { GenerateOptions, ImageQuality, ModelConfig } from "./types";

/** Keys and pins the planner resolves against. */
export interface PlanContext {
  falKey?: string;
  pins?: Readonly<Partial<Record<TaskId, string>>>;
}

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
  const definition: TaskDefinition = TASKS[task];
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
    look: definition.generationModels === true ? input.look : undefined,
    markup: input.markup !== undefined,
    mask: input.mask !== undefined,
    mode: input.mode,
    model: input.model,
    negativePrompt: input.negativePrompt !== undefined,
    outputFormat: input.outputFormat,
    references,
    resolution: input.resolution,
    rig: input.rig,
    seed: input.seed !== undefined,
    source,
    tier: input.tier,
    transparent: input.transparent,
  };
}

/**
 * The Model's request body, or the refusal. The ranking asks this of each
 * candidate, so a Model the planner would refuse is skipped, not chosen.
 */
function planModel(
  task: TaskId,
  model: string,
  input: TaskInput
): Result<PlanBody, MotifError> {
  const noSource = missingSource(task, model, input);
  if (noSource !== undefined) {
    return err(noSource);
  }
  try {
    return planBody(task, model, input);
  } catch (error) {
    return err(withCode(error, model, task));
  }
}

function resolve(
  task: TaskId,
  input: TaskInput,
  context: PlanContext,
  options: PlanOptions,
  plans: Map<string, Result<PlanBody, MotifError>>
): Result<TaskResolved, MotifError> {
  const keys: string[] = [];
  if (options.dryRun === true || context.falKey !== undefined) {
    keys.push("FAL_KEY");
  }
  const request = taskRequest(task, input);
  const environment = { keys, pins: context.pins };
  const resolution = resolveTask(task, request, {
    ...environment,
    refusal: (model) => {
      const planned = planModel(task, model, input);
      plans.set(model, planned);
      return planned.isErr() ? planned.error : undefined;
    },
  });
  if (resolution.ok) {
    return ok(resolution);
  }
  // Every ranked Model the profiles allowed was refused by the planner: report
  // the refusal of the one the profiles alone would have chosen.
  const unfiltered = resolveTask(task, request, environment);
  const refused = unfiltered.ok ? plans.get(unfiltered.model) : undefined;
  if (refused?.isErr() === true) {
    return err(refused.error);
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

  const plans = new Map<string, Result<PlanBody, MotifError>>();
  const resolved = resolve(task, input, context, options, plans);
  if (resolved.isErr()) {
    return err(resolved.error);
  }
  const { chosenBy, model, tier } = resolved.value;
  const built = plans.get(model) ?? planModel(task, model, input);
  if (built.isErr()) {
    return err(built.error);
  }
  return ok({
    ...built.value,
    chosenBy,
    model,
    ...(input.mode !== undefined && { mode: input.mode }),
    size: requestedSize(built.value.body),
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
  const definition: TaskDefinition = TASKS[task];
  if (
    definition.sourceless === true ||
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

/** Refusals a Task makes whatever Model it resolves to. */
function taskInputRefusal(
  task: TaskId,
  input: TaskInput
): MotifError | undefined {
  if (
    input.count !== undefined &&
    !(Number.isInteger(input.count) && input.count >= 1)
  ) {
    return invalidOption(
      `count must be a whole number of at least 1, not ${input.count}.`,
      { field: "count", task }
    );
  }
  if (
    input.seed !== undefined &&
    !(Number.isInteger(input.seed) && input.seed >= 0)
  ) {
    return invalidOption(
      `seed must be a whole number of at least 0, not ${input.seed}.`,
      { field: "seed", task }
    );
  }
  const definition: TaskDefinition = TASKS[task];
  if (definition.oneReference === true && input.references?.length !== 1) {
    return invalidOption(`${task} takes exactly one reference image.`, {
      field: "references",
      task,
    });
  }
  const described = (input.prompt ?? "") !== "" || (input.mood ?? "") !== "";
  if (definition.takesMood === true && input.mode === undefined && !described) {
    return invalidOption(
      `${task} needs a prompt describing the light, or a mood.`,
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
  if (config?.type === "utility") {
    return upscalerPlan(task, model, config, input);
  }
  if (config?.type === "video") {
    return videoPlan(task, model, config, input);
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
  "markup",
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

const IMAGE_QUALITIES: readonly ImageQuality[] = [
  "auto",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

function isImageQuality(value: unknown): value is ImageQuality {
  return IMAGE_QUALITIES.some((level) => level === value);
}

/** The TaskInput field behind each option `buildGenerateBody` can refuse. */
const FIELD_FOR_OPTION: Partial<Record<ModelOption, CarriedField>> = {
  aspect: "aspect",
  background: "transparent",
  "image editing": "references",
  markupImageUrl: "markup",
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
  const definition: TaskDefinition = TASKS[task];
  if (definition.needsPrompt === true && (input.prompt ?? "") === "") {
    return err(
      invalidOption(`${task} needs a prompt.`, { field: "prompt", task })
    );
  }
  const editImageUrls = [
    ...(task === "vary" && input.image !== undefined ? [input.image] : []),
    ...(input.references ?? []),
  ];
  if (input.markup !== undefined && editImageUrls.length === 0) {
    return err(
      invalidOption(
        "Markup applies to the image being edited; pass references.",
        { field: "markup", requires: "references" }
      )
    );
  }
  if (input.mask !== undefined && editImageUrls.length === 0) {
    return err(
      invalidOption("A mask applies to a reference image; pass references.", {
        field: "mask",
        requires: "references",
      })
    );
  }
  if (
    input.outputFormat !== undefined &&
    !outputFormatsOf(config, editImageUrls.length > 0).includes(
      input.outputFormat
    )
  ) {
    return err(cannotCarry("outputFormat", model, task));
  }
  if (
    input.transparent === true &&
    input.outputFormat !== undefined &&
    OPAQUE_OUTPUT_FORMATS.includes(input.outputFormat)
  ) {
    return err(
      invalidOption(
        `${model} cannot keep transparency in ${input.outputFormat}; use ${outputFormatsOf(
          config,
          editImageUrls.length > 0
        )
          .filter((format) => !OPAQUE_OUTPUT_FORMATS.includes(format))
          .join(", ")}.`,
        { field: "outputFormat", model, task, transparent: true }
      )
    );
  }

  // `params.quality` goes through `buildGenerateBody`, which checks it against
  // the Model's levels.
  const { quality, ...params } = input.params ?? {};
  const liftQuality = config.supportsQuality === true && quality !== undefined;
  if (liftQuality && !isImageQuality(quality)) {
    return err(
      invalidOption(
        `params.quality must be one of ${IMAGE_QUALITIES.join(", ")}.`,
        { field: "params", key: "quality" }
      )
    );
  }
  // The edited image is the first one: the Source of a vary, else a Reference.
  const source =
    dataUrlImageSize(editImageUrls[0] ?? "") ??
    (task === "vary" ? input.sourceSize : undefined);
  const options: GenerateOptions = {
    aspect:
      input.aspect ??
      (editImageUrls.length === 0 || source === undefined
        ? undefined
        : aspectFromSource(
            config,
            source,
            input.resolution ?? DEFAULT_GENERATION_RESOLUTION
          )),
    background: input.transparent === true ? "transparent" : undefined,
    creative: creativeOf(input),
    editImageUrls: editImageUrls.length > 0 ? editImageUrls : undefined,
    markupImageUrl: input.markup,
    maskImageUrl: input.mask,
    model,
    negativePrompt: input.negativePrompt,
    numImages: input.count,
    outputFormat: input.outputFormat,
    prompt:
      task === "vary" && (input.prompt ?? "") === ""
        ? VARY_PROMPT
        : (input.prompt ?? ""),
    quality: liftQuality && isImageQuality(quality) ? quality : undefined,
    resolution: input.resolution,
    seed: input.seed,
    transparent: input.transparent,
  };
  let built: ReturnType<typeof buildGenerateBody>;
  try {
    built = buildGenerateBody(options);
  } catch (error) {
    return err(generationError(error, model, task));
  }
  const merged = mergeParams(
    built.body,
    liftQuality ? params : input.params,
    ownedGenerationKeys(input)
  );
  if (merged.isErr()) {
    return err(merged.error);
  }
  const badParam =
    input.params === undefined
      ? undefined
      : generationParamsRefusal(
          task,
          model,
          config,
          input.params,
          editImageUrls.length > 0
        );
  if (badParam !== undefined) {
    return err(badParam);
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
