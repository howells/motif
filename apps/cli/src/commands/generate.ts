/**
 * generate and vary: run the generate or vary Task through the SDK client,
 * then save every image, record history and emit.
 *
 * Security posture: the agent is not a trusted operator.
 * All inputs are validated. Output paths must stay inside the git root (or CWD outside a repo).
 * Use --dry-run before mutating commands.
 */

import {
  enrichPrompt,
  formatCost,
  getLook,
  promptWarnings,
} from "@howells/motif-sdk";
import type {
  AspectRatio,
  CreativeDirection,
  PromptWarning,
  Resolution,
  TaskInput,
  TaskOutput,
  TaskPlan,
} from "@howells/motif-sdk";
import chalk from "chalk";
import ora from "ora";

import type { CliOptions, StdinPayload } from "../utils/cli-types";
import type { MotifConfig } from "../utils/config";
import { resolveCreativeDirection } from "../utils/creative";
import { handleError, validateOption } from "../utils/errors";
import {
  OUTPUT_FORMATS,
  resolveEditPaths,
  resolvePreset,
} from "../utils/generate-options";
import { generateFilename } from "../utils/image";
import {
  parseIntegerOption,
  validateEnumOption,
  validateOutputPath,
} from "../utils/input";
import {
  imageSource,
  motifClient,
  planForOutput,
  redactDataUrls,
} from "../utils/motif-client";
import { emit, isStructured } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { exitTaskError, exitTaskFailed } from "../utils/task-model";
import { firstText, hasText } from "../utils/text";
import {
  deleteEphemeralPayloads,
  exitIfTransparencyMissing,
  saveGeneratedImages,
} from "./save-images";
import type { ImageSource } from "./save-images";
import { commonInput } from "./verbs/shared";

const DATA_URL_REGEX = /^data:[^;,]+;base64,(.*)$/s;

/** Print prompt warnings in yellow for human output. */
function printPromptWarnings(warnings: readonly PromptWarning[]): void {
  for (const warning of warnings) {
    console.log(chalk.yellow(`Warning (${warning.rule}): ${warning.message}`));
  }
}

/** Everything a generate or vary run needs once its flags are read. */
export interface GenerationRun {
  command: "generate" | "vary";
  task: "generate" | "vary";
  input: TaskInput;
  aspect: AspectRatio;
  resolution: Resolution;
  numImages: number;
  outputPath: string;
  /** Whether `-o` named the path; only then does its extension pick a format. */
  explicitOutput: boolean;
  basePrompt: string;
  creative?: CreativeDirection;
  editPaths?: string[];
  warnings: readonly PromptWarning[];
  ephemeral: boolean;
  noOpen: boolean;
  dryRun: boolean;
  transparent: boolean;
  /** Fields added to every JSON result, e.g. vary's `varyModel`. */
  extra?: Record<string, unknown>;
}

function taskFields(plan: TaskPlan | TaskOutput): Record<string, unknown> {
  return {
    task: plan.task,
    model: plan.model,
    tier: plan.tier,
    chosenBy: plan.chosenBy,
    ...(plan.mode === undefined ? {} : { mode: plan.mode }),
    cost: plan.cost.usd,
    costBasis: plan.cost.basis,
    provider: plan.provider,
  };
}

function creativeFields(run: GenerationRun): Record<string, unknown> {
  if (run.creative === undefined) {
    return {};
  }
  const { creative } = run;
  const enriched = enrichPrompt({ creative, prompt: run.basePrompt });
  return { basePrompt: enriched.basePrompt, creative: enriched.creative };
}

/** A returned file as something `saveGeneratedImages` writes. */
function imageFrom(url: string): ImageSource {
  const match = DATA_URL_REGEX.exec(url);
  return match?.[1] === undefined
    ? { url }
    : { bytes: new Uint8Array(Buffer.from(match[1], "base64")) };
}

function printDryRun(run: GenerationRun, plan: TaskPlan): void {
  console.log(chalk.bold("\nDry run: no API call made\n"));
  console.log(`  Tier:   ${plan.tier}`);
  console.log(`  Aspect: ${run.aspect} | Resolution: ${run.resolution}`);
  console.log(`  Images: ${run.numImages}`);
  console.log(`  Output: ${chalk.dim(run.outputPath)}`);
  console.log(`  Cost:   ${chalk.yellow(formatCost(plan.cost.usd))}`);
  printPromptWarnings(run.warnings);
  if (run.ephemeral) {
    console.log("  Fal IO: not retained after local download");
  }
  if (run.editPaths) {
    console.log(`  Edit:   ${chalk.dim(run.editPaths.join(", "))}`);
  }
}

function printStart(run: GenerationRun, plan: TaskPlan): void {
  const prompt = plan.prompt ?? run.basePrompt;
  console.log(
    chalk.bold(`\n${run.task === "vary" ? "Varying" : "Generating"}`)
  );
  console.log(`Aspect: ${run.aspect} | Resolution: ${run.resolution}`);
  console.log(
    `Prompt: ${chalk.dim(prompt.slice(0, 80))}${prompt.length > 80 ? "..." : ""}`
  );
  console.log(`Est. cost: ${chalk.yellow(formatCost(plan.cost.usd))}`);
  printPromptWarnings(run.warnings);
  if (run.editPaths) {
    console.log(`References: ${chalk.dim(run.editPaths.join(", "))}`);
  }
}

/** Plan, then dry-run or run, save, record and emit. */
export async function runGeneration(
  run: GenerationRun,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  const client = motifClient(config);
  const planned = planForOutput(
    client,
    run.task,
    run.input,
    run.explicitOutput ? run.outputPath : undefined,
    run.dryRun
  );
  if (planned.isErr()) {
    exitTaskError(planned.error, emitOpts.format, { task: run.task });
  }
  const { input, plan } = planned.value;

  if (run.dryRun) {
    emit(
      {
        dryRun: true,
        command: run.command,
        ...taskFields(plan),
        ...run.extra,
        prompt: plan.prompt,
        warnings: run.warnings,
        ...creativeFields(run),
        aspect: run.aspect,
        resolution: run.resolution,
        numImages: run.numImages,
        output: run.outputPath,
        editImages: run.editPaths,
        transparent: run.transparent,
        ephemeral: run.ephemeral,
        historyRecorded: !run.ephemeral,
        storeIo: !run.ephemeral,
        request: redactDataUrls(plan.body),
        valid: true,
      },
      emitOpts
    );
    if (!isStructured(emitOpts.format)) {
      printDryRun(run, plan);
    }
    return;
  }

  if (!isStructured(emitOpts.format)) {
    printStart(run, plan);
  }
  const spinner = isStructured(emitOpts.format)
    ? null
    : ora("Generating...").start();
  const ran = await client.run(run.task, {
    ...input,
    onProgress: (status) => {
      if (spinner) {
        spinner.text = `Generating... ${status}`;
      }
    },
  });
  if (ran.isErr()) {
    spinner?.fail("Generation failed");
    exitTaskError(ran.error, emitOpts.format, {
      model: plan.model,
      task: run.task,
    });
  }
  const output = ran.value;
  spinner?.succeed("Generated!");

  try {
    if (output.files.length === 0) {
      throw new Error(`${run.task} returned no images`);
    }
    const saved = await saveGeneratedImages(
      output.files.map((file) => imageFrom(file.url)),
      run.outputPath,
      run.numImages,
      {
        aspect: run.aspect,
        costPerImage:
          output.cost.usd === null
            ? null
            : output.cost.usd / output.files.length,
        editPaths: run.editPaths,
        look: run.creative?.look,
        model: output.model,
        mood: run.creative?.mood,
        prompt: output.prompt ?? run.basePrompt,
        requireTransparency: run.transparent,
        resolution: run.resolution,
      },
      config,
      emitOpts,
      run.noOpen,
      !run.ephemeral
    );

    const { payloadDeleteError, payloadsDeleted } = run.ephemeral
      ? await deleteEphemeralPayloads(client, output.requestId, emitOpts.format)
      : { payloadDeleteError: undefined, payloadsDeleted: false };

    emit(
      {
        command: run.command,
        ...saved,
        ...taskFields(output),
        cost: saved.cost,
        ...run.extra,
        ephemeral: run.ephemeral,
        ...(run.ephemeral && {
          payloadsDeleted,
          requestId: output.requestId,
          storeIo: false,
        }),
        ...(hasText(payloadDeleteError) && { payloadDeleteError }),
        prompt: output.prompt,
        warnings: run.warnings,
        ...creativeFields(run),
        aspect: run.aspect,
        resolution: run.resolution,
        numImages: run.numImages,
      },
      emitOpts
    );
  } catch (error) {
    exitIfTransparencyMissing(error, emitOpts.format);
    exitTaskFailed(
      error instanceof Error ? error.message : String(error),
      { model: output.model, task: run.task },
      emitOpts.format
    );
  }
}

/** Whether the caller, a preset, or a Look chose the aspect. */
function aspectIsChosen(
  options: CliOptions,
  stdinData: StdinPayload | null,
  lookAspect: string | undefined,
  config: MotifConfig
): boolean {
  const presetFlags = [
    "cover",
    "story",
    "reel",
    "feed",
    "og",
    "wallpaper",
    "ultra",
    "wide",
    "square",
    "landscape",
    "portrait",
  ] as const;
  return (
    presetFlags.some((flag) => options[flag] === true) ||
    hasText(stdinData?.preset) ||
    hasText(options.aspect ?? stdinData?.aspect) ||
    lookAspect !== undefined ||
    config.defaultAspect !== "1:1"
  );
}

/**
 * Whether the caller or config chose the resolution. An unchosen 2K is left
 * to the Model; an explicit `-r 2K` is sent.
 */
function resolutionIsChosen(
  options: CliOptions,
  stdinData: StdinPayload | null,
  resolution: string,
  config: MotifConfig
): boolean {
  return (
    hasText(options.resolution ?? stdinData?.resolution) ||
    config.defaultResolution !== "2K" ||
    resolution !== "2K"
  );
}

async function referenceSources(
  paths: readonly string[] | undefined,
  emitOpts: EmitOptions
): Promise<string[] | undefined> {
  if (paths === undefined) {
    return undefined;
  }
  try {
    return await Promise.all(
      paths.map(async (path) => await imageSource(path))
    );
  } catch (error) {
    handleError(error, "INVALID_EDIT_PATH", emitOpts.format);
  }
}

async function maskSource(
  mask: string | undefined,
  emitOpts: EmitOptions
): Promise<string | undefined> {
  if (!hasText(mask)) {
    return undefined;
  }
  try {
    return await imageSource(mask);
  } catch (error) {
    handleError(error, "INVALID_EDIT_PATH", emitOpts.format);
  }
}

export async function generateImage(
  prompt: string,
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  const creative = resolveCreativeDirection(options, stdinData?.creative);
  const creativeResult = creative
    ? validateOption(emitOpts.format, () => enrichPrompt({ creative, prompt }))
    : undefined;
  const look = hasText(creative?.look) ? getLook(creative.look) : undefined;
  // Advisory only, and checked against the caller's own words.
  const editFiles = options.edit ?? stdinData?.editImages;
  const warnings = promptWarnings(creativeResult?.basePrompt ?? prompt, {
    editing: (editFiles ?? []).length > 0,
  });

  const { aspect, resolution } = validateOption(emitOpts.format, () =>
    resolvePreset(
      options,
      stdinData?.preset,
      stdinData?.aspect,
      stdinData?.resolution,
      look?.aspect ?? config.defaultAspect,
      config.defaultResolution
    )
  );

  const numImages = validateOption(emitOpts.format, () =>
    parseIntegerOption(stdinData?.numImages ?? options.num ?? 1, "num images", {
      max: 4,
      min: 1,
    })
  );

  const rawOutput = firstText(options.output, stdinData?.output);
  let outputPath: string;
  try {
    outputPath = hasText(rawOutput)
      ? validateOutputPath(rawOutput)
      : generateFilename();
  } catch (error) {
    handleError(error, "INVALID_OUTPUT_PATH", emitOpts.format);
  }

  const seed = validateOption(emitOpts.format, () =>
    options.seed !== undefined || stdinData?.seed !== undefined
      ? parseIntegerOption(options.seed ?? stdinData?.seed ?? 0, "seed")
      : undefined
  );
  const negativePrompt = firstText(options.negative, stdinData?.negativePrompt);
  const outputFormat = validateOption(emitOpts.format, () =>
    hasText(options.outputFormat) || hasText(stdinData?.outputFormat)
      ? validateEnumOption(
          options.outputFormat ?? stdinData?.outputFormat ?? "",
          OUTPUT_FORMATS,
          "output format"
        )
      : undefined
  );
  const transparent = (options.transparent ?? stdinData?.transparent) === true;
  const ephemeral = (options.ephemeral ?? stdinData?.ephemeral) === true;
  const editPaths = resolveEditPaths(editFiles, emitOpts.format);
  const references = await referenceSources(editPaths, emitOpts);
  const mask = await maskSource(
    options.mask ?? stdinData?.maskImageUrl,
    emitOpts
  );
  const common = commonInput(
    {
      model: firstText(options.model, stdinData?.model),
      param: options.param,
      tier: firstText(options.tier, stdinData?.tier),
    },
    emitOpts.format
  );

  const input: TaskInput = {
    ...common,
    prompt,
    ...(aspectIsChosen(options, stdinData, look?.aspect, config) && {
      aspect,
    }),
    ...(resolutionIsChosen(options, stdinData, resolution, config) && {
      resolution,
    }),
    ...(numImages > 1 && { count: numImages }),
    ...(seed !== undefined && { seed }),
    ...(hasText(negativePrompt) && { negativePrompt }),
    ...(outputFormat !== undefined && { outputFormat }),
    ...(transparent && { transparent }),
    ...(references !== undefined && { references }),
    ...(mask !== undefined && { mask }),
    ...(hasText(creative?.look) && { look: creative.look }),
    ...(hasText(creative?.mood) && { mood: creative.mood }),
    ...(ephemeral && { ephemeral }),
  };

  await runGeneration(
    {
      aspect,
      basePrompt: prompt,
      command: "generate",
      creative,
      dryRun: options.dryRun === true,
      editPaths,
      ephemeral,
      explicitOutput: hasText(rawOutput),
      input,
      noOpen: options.noOpen === true || stdinData?.noOpen === true,
      numImages,
      outputPath,
      resolution,
      task: "generate",
      transparent,
      warnings,
    },
    config,
    emitOpts
  );
}
