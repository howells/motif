/**
 * Post-processing commands operating on the last generation (or a given path):
 * vary (variations), upscale, and background removal.
 */

import { basename, resolve } from "node:path";

import { MODELS, TASKS } from "@howells/motif-sdk";
import type { AspectRatio, Resolution } from "@howells/motif-sdk";
import chalk from "chalk";
import ora from "ora";

import { removeBackground, upscale } from "../api/fal";
import type { CliOptions, StdinPayload } from "../utils/cli-types";
import { addGeneration, generateId, getLastGeneration } from "../utils/config";
import type { MotifConfig } from "../utils/config";
import { resolveCreativeDirection } from "../utils/creative";
import {
  exitForErrorCode,
  handleError,
  validateOption,
  validateOutput,
} from "../utils/errors";
import {
  downloadImage,
  getFileSize,
  getImageDimensions,
  imageToDataUrl,
  openImage,
} from "../utils/image";
import {
  parseIntegerOption,
  validateEditPath,
  validateEnumOption,
  validateOutputPath,
} from "../utils/input";
import { emit, emitError, isStructured } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import {
  exitNoModelAvailable,
  legacyBackgroundRemover,
  legacyUpscaler,
  resolveTaskModel,
} from "../utils/task-model";
import { firstText, hasText } from "../utils/text";
import { generateImage } from "./generate";

// -- Constants --

/** Regex to match image file extensions for upscale output naming */
const IMAGE_EXT_REGEX = /\.(png|jpg|jpeg|webp)$/i;
const SCALE_FACTORS = ["2", "4", "6", "8"] as const;

function derivedOutputPath(sourcePath: string, suffix: string): string {
  const preferred = sourcePath.replace(IMAGE_EXT_REGEX, `${suffix}.png`);
  try {
    return validateOutputPath(preferred);
  } catch {
    const name = basename(sourcePath).replace(IMAGE_EXT_REGEX, "") || "motif";
    return validateOutputPath(`${name}${suffix}.png`);
  }
}

export async function generateVariations(
  customPrompt: string | undefined,
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  const last = await getLastGeneration();
  if (!last) {
    emitError(
      {
        code: "NO_PREVIOUS",
        message: "No previous generation to create variations of",
      },
      emitOpts.format
    );
    exitForErrorCode("NO_PREVIOUS");
  }

  const prompt = firstText(customPrompt, stdinData?.prompt) ?? last.prompt;
  const numImages = validateOption(emitOpts.format, () =>
    parseIntegerOption(stdinData?.numImages ?? options.num ?? 4, "num images", {
      max: 4,
      min: 1,
    })
  );

  const explicitModel = firstText(options.model, stdinData?.model);
  let model = explicitModel;
  let varyModel: "reused" | "resolved" | undefined;
  if (explicitModel === undefined) {
    // Reuse the varied image's Model while vary still ranks it.
    if (TASKS.vary.models.some((entry) => entry.model === last.model)) {
      model = last.model;
      varyModel = "reused";
    } else {
      const look = resolveCreativeDirection(options, stdinData?.creative)?.look;
      const resolution = resolveTaskModel(
        "vary",
        { count: numImages, look, references: 1 },
        config,
        { dryRun: options.dryRun === true }
      );
      if (!resolution.ok) {
        exitNoModelAvailable(resolution, emitOpts.format);
      }
      model = resolution.model;
      varyModel = "resolved";
    }
  }

  if (!isStructured(emitOpts.format)) {
    console.log(chalk.bold("\nGenerating variations..."));
    console.log(`Base: ${chalk.dim(last.prompt.slice(0, 50))}...`);
  }

  await generateImage(
    prompt,
    {
      ...options,
      aspect: firstText(options.aspect, stdinData?.aspect) ?? last.aspect,
      model,
      num: String(numImages),
      // The varied image's resolution carries over only to a Model that
      // takes one; a named --resolution is still validated as usual.
      resolution:
        firstText(options.resolution, stdinData?.resolution) ??
        (MODELS[model ?? ""]?.supportsResolution === true
          ? last.resolution
          : undefined),
    },
    null, // Don't pass stdinData again (already merged into options)
    config,
    emitOpts,
    varyModel === undefined ? {} : { varyModel }
  );
}

export async function upscaleLast(
  imagePath: string | undefined,
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  let sourceImagePath: string;
  let sourcePrompt = "[upscale]";
  let sourceAspect: AspectRatio = "1:1";
  let sourceResolution: Resolution = "1K";

  const resolvedPath = firstText(imagePath, stdinData?.imagePath);

  if (resolvedPath === undefined) {
    const last = await getLastGeneration();
    if (!last) {
      emitError(
        { code: "NO_PREVIOUS", message: "No previous generation to upscale" },
        emitOpts.format
      );
      exitForErrorCode("NO_PREVIOUS");
    }
    sourceImagePath = last.output;
    sourcePrompt = last.prompt;
    sourceAspect = last.aspect;
    sourceResolution = last.resolution;
  } else {
    try {
      sourceImagePath = validateEditPath(resolvedPath);
    } catch (error) {
      handleError(error, "INVALID_IMAGE_PATH", emitOpts.format);
    }
  }

  const scaleFactor = validateOption(emitOpts.format, () =>
    Number(
      validateEnumOption(
        String(stdinData?.scale ?? options.scale ?? 2),
        SCALE_FACTORS,
        "scale factor"
      )
    )
  );
  const upscaler = legacyUpscaler(config);
  const rawOutput = firstText(options.output, stdinData?.output);
  const outputPath =
    rawOutput === undefined
      ? derivedOutputPath(sourceImagePath, `-up${scaleFactor}x`)
      : validateOutput(emitOpts.format, rawOutput);

  // -- Dry run --
  if (options.dryRun === true) {
    const dryResult = {
      command: "upscale",
      dryRun: true,
      estimatedCost: 0.02,
      model: upscaler,
      output: outputPath,
      scale: scaleFactor,
      source: sourceImagePath,
      valid: true,
    };
    emit(dryResult, emitOpts);
    if (!isStructured(emitOpts.format)) {
      console.log(chalk.bold("\n🔍 Dry run — no API call made\n"));
      console.log(`  Source: ${chalk.dim(sourceImagePath)}`);
      console.log(`  Scale:  ${scaleFactor}x`);
      console.log(`  Model:  ${upscaler}`);
      console.log(`  Output: ${chalk.dim(outputPath)}`);
      console.log(`  Cost:   ${chalk.yellow("~$0.02")}`);
    }
    return;
  }

  if (!isStructured(emitOpts.format)) {
    console.log(chalk.bold("\nUpscaling..."));
    console.log(`Source: ${chalk.dim(sourceImagePath)}`);
    console.log(`Scale: ${scaleFactor}x | Model: ${upscaler}`);
  }

  const spinner = isStructured(emitOpts.format)
    ? null
    : ora("Upscaling...").start();

  try {
    const imageData = await imageToDataUrl(sourceImagePath);

    const result = await upscale({
      imageUrl: imageData,
      model: upscaler,
      scaleFactor,
      // Clarity upscale params from stdin (power-user API access)
      ...(hasText(stdinData?.upscalePrompt) && {
        prompt: stdinData.upscalePrompt,
      }),
      ...(hasText(stdinData?.upscaleNegativePrompt) && {
        negativePrompt: stdinData.upscaleNegativePrompt,
      }),
      ...(stdinData?.upscaleResemblance !== undefined && {
        resemblance: stdinData.upscaleResemblance,
      }),
      ...(stdinData?.upscaleNumInferenceSteps !== undefined && {
        numInferenceSteps: stdinData.upscaleNumInferenceSteps,
      }),
      ...(stdinData?.upscaleGuidanceScale !== undefined && {
        guidanceScale: stdinData.upscaleGuidanceScale,
      }),
    });

    spinner?.succeed("Upscaled!");

    // biome-ignore lint/style/noNonNullAssertion: API always returns at least one image
    const image = result.images[0]!;
    const actualOutputPath = await downloadImage(image.url, outputPath);

    const dims = await getImageDimensions(actualOutputPath);
    const size = getFileSize(actualOutputPath);

    if (!isStructured(emitOpts.format)) {
      console.log(
        chalk.green(`✓ Saved: ${actualOutputPath}`) +
          chalk.dim(
            ` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`
          )
      );
    }

    await addGeneration({
      aspect: sourceAspect,
      cost: 0.02,
      editedFrom: sourceImagePath,
      id: generateId(),
      model: upscaler,
      output: resolve(actualOutputPath),
      prompt: `[upscale ${scaleFactor}x] ${sourcePrompt}`,
      resolution: sourceResolution,
      timestamp: new Date().toISOString(),
    });

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "upscale",
          cost: 0.02,
          height: dims?.height,
          model: upscaler,
          path: resolve(actualOutputPath),
          scale: scaleFactor,
          size,
          source: sourceImagePath,
          width: dims?.width,
        },
        emitOpts
      );
    }

    if (
      config.openAfterGenerate &&
      options.noOpen !== true &&
      stdinData?.noOpen !== true
    ) {
      openImage(actualOutputPath);
    }
  } catch (error) {
    spinner?.fail("Upscale failed");
    handleError(error, "UPSCALE_FAILED", emitOpts.format);
  }
}

export async function removeBackgroundLast(
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  const last = await getLastGeneration();
  if (!last) {
    emitError(
      {
        code: "NO_PREVIOUS",
        message: "No previous generation to remove background from",
      },
      emitOpts.format
    );
    exitForErrorCode("NO_PREVIOUS");
  }

  const backgroundRemover = legacyBackgroundRemover(config);
  const rawOutput = firstText(options.output, stdinData?.output);
  const outputPath =
    rawOutput === undefined
      ? derivedOutputPath(last.output, "-nobg")
      : validateOutput(emitOpts.format, rawOutput);

  // -- Dry run --
  if (options.dryRun === true) {
    const dryResult = {
      command: "rmbg",
      dryRun: true,
      estimatedCost: 0.02,
      model: backgroundRemover,
      output: outputPath,
      source: last.output,
      valid: true,
    };
    emit(dryResult, emitOpts);
    if (!isStructured(emitOpts.format)) {
      console.log(chalk.bold("\n🔍 Dry run — no API call made\n"));
      console.log(`  Source: ${chalk.dim(last.output)}`);
      console.log(`  Model:  ${backgroundRemover}`);
      console.log(`  Output: ${chalk.dim(outputPath)}`);
      console.log(`  Cost:   ${chalk.yellow("~$0.02")}`);
    }
    return;
  }

  if (!isStructured(emitOpts.format)) {
    console.log(chalk.bold("\nRemoving background..."));
    console.log(`Source: ${chalk.dim(last.output)}`);
    console.log(`Model: ${backgroundRemover}`);
  }

  const spinner = isStructured(emitOpts.format)
    ? null
    : ora("Processing...").start();

  try {
    const imageData = await imageToDataUrl(last.output);

    const result = await removeBackground({
      imageUrl: imageData,
      model: backgroundRemover,
      // BiRefNet params from stdin. These are deliberate pass-throughs: fal
      // validates the values server-side, and validating locally would change
      // the error envelope (INVALID_OPTION instead of RMBG_FAILED).
      ...(hasText(stdinData?.rmbgVariant) && {
        // oxlint-disable-next-line no-unsafe-type-assertion -- pass-through to fal; server validates, local validation would change the error envelope
        variant: stdinData.rmbgVariant as
          | "General Use (Light)"
          | "General Use (Heavy)"
          | "Portrait",
      }),
      ...(hasText(stdinData?.rmbgOperatingResolution) && {
        // oxlint-disable-next-line no-unsafe-type-assertion -- pass-through to fal; server validates, local validation would change the error envelope
        operatingResolution: stdinData.rmbgOperatingResolution as
          | "1024x1024"
          | "2048x2048",
      }),
      ...(hasText(stdinData?.rmbgOutputFormat) && {
        // oxlint-disable-next-line no-unsafe-type-assertion -- pass-through to fal; server validates, local validation would change the error envelope
        outputFormat: stdinData.rmbgOutputFormat as "png" | "webp" | "gif",
      }),
      ...(stdinData?.rmbgRefineForeground !== undefined && {
        refineForeground: stdinData.rmbgRefineForeground,
      }),
      ...(stdinData?.rmbgOutputMask !== undefined && {
        outputMask: stdinData.rmbgOutputMask,
      }),
    });

    spinner?.succeed("Background removed!");

    // biome-ignore lint/style/noNonNullAssertion: API always returns at least one image
    const image = result.images[0]!;
    const actualOutputPath = await downloadImage(image.url, outputPath);

    const dims = await getImageDimensions(actualOutputPath);
    const size = getFileSize(actualOutputPath);

    if (!isStructured(emitOpts.format)) {
      console.log(
        chalk.green(`✓ Saved: ${actualOutputPath}`) +
          chalk.dim(
            ` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`
          )
      );
    }

    await addGeneration({
      aspect: last.aspect,
      cost: 0.02,
      editedFrom: last.output,
      id: generateId(),
      model: backgroundRemover,
      output: resolve(actualOutputPath),
      prompt: `[rmbg] ${last.prompt}`,
      resolution: last.resolution,
      timestamp: new Date().toISOString(),
    });

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "rmbg",
          cost: 0.02,
          height: dims?.height,
          model: backgroundRemover,
          path: resolve(actualOutputPath),
          size,
          source: last.output,
          width: dims?.width,
        },
        emitOpts
      );
    }

    if (
      config.openAfterGenerate &&
      options.noOpen !== true &&
      stdinData?.noOpen !== true
    ) {
      openImage(actualOutputPath);
    }
  } catch (error) {
    spinner?.fail("Background removal failed");
    handleError(error, "RMBG_FAILED", emitOpts.format);
  }
}
