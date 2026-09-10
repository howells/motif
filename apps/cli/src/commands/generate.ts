/**
 * generate command — build the fal request, run generation, and save results.
 *
 * Security posture: the agent is not a trusted operator.
 * All inputs are validated. Output paths must stay inside the git root (or CWD outside a repo).
 * Use --dry-run before mutating commands.
 */

import {
  aspectToGptSize,
  buildGenerateBody,
  enrichPrompt,
  estimateCost,
  formatCost,
  GENERATION_MODELS,
  getLook,
  MODELS,
  promptWarnings,
} from "@howells/motif-sdk";
import type {
  GenerateOptions,
  PromptWarning,
  ProviderRoute,
} from "@howells/motif-sdk";
import { providerPricePerImageUsd } from "@howells/motif-sdk/image";
import chalk from "chalk";
import ora from "ora";

import { generate } from "../api/fal";
import type { CliOptions, StdinPayload } from "../utils/cli-types";
import { getApiKey, loadConfig } from "../utils/config";
import { resolveCreativeDirection } from "../utils/creative";
import { exitForErrorCode, handleError, validateOption } from "../utils/errors";
import {
  BACKGROUND_MODES,
  OUTPUT_FORMATS,
  parseImageSizeOption,
  QUALITY_LEVELS,
  RENDERING_SPEEDS,
  resolveEditPaths,
  resolvePreset,
  SAFETY_LEVELS,
  THINKING_LEVELS,
} from "../utils/generate-options";
import { generateFilename } from "../utils/image";
import {
  parseIntegerOption,
  parseNumberOption,
  validateEnumOption,
  validateOutputPath,
  validateResourceId,
} from "../utils/input";
import { emit, emitError, isStructured } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { firstText, hasText } from "../utils/text";
import {
  requireRouteKey,
  routeDryRunFields,
  routePreview,
  runRoute,
  validateRoute,
} from "./generate-openai";
import type { RouteRequest } from "./generate-openai";
import {
  deleteEphemeralPayloads,
  exitIfTransparencyMissing,
  saveGeneratedImages,
} from "./save-images";

/** Print prompt warnings in yellow for human output. */
function printPromptWarnings(warnings: readonly PromptWarning[]): void {
  for (const warning of warnings) {
    console.log(chalk.yellow(`Warning (${warning.rule}): ${warning.message}`));
  }
}

export async function generateImage(
  prompt: string,
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions
): Promise<void> {
  // Creative direction resolves first: a look supplies the model and aspect
  // defaults used when the caller named neither.
  const creative = resolveCreativeDirection(options, stdinData?.creative);
  const creativeResult = creative
    ? validateOption(emitOpts.format, () => enrichPrompt({ creative, prompt }))
    : undefined;
  const requestPrompt = creativeResult?.prompt ?? prompt;
  const look = hasText(creative?.look) ? getLook(creative.look) : undefined;
  // Advisory only, and checked against the caller's own words, never the
  // look or mood text.
  const warnings = promptWarnings(creativeResult?.basePrompt ?? prompt, {
    editing: (options.edit ?? stdinData?.editImages ?? []).length > 0,
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

  const modelId =
    firstText(options.model, stdinData?.model) ??
    look?.model ??
    config.defaultModel;

  // Validate model name against hallucination patterns
  try {
    validateResourceId(modelId, "model");
  } catch (error) {
    handleError(error, "INVALID_MODEL_ID", emitOpts.format);
  }

  const numImages = validateOption(emitOpts.format, () =>
    parseIntegerOption(stdinData?.numImages ?? options.num ?? 1, "num images", {
      max: 4,
      min: 1,
    })
  );

  let outputPath: string;
  try {
    const rawOutput = firstText(options.output, stdinData?.output);
    outputPath = hasText(rawOutput)
      ? validateOutputPath(rawOutput)
      : generateFilename();
  } catch (error) {
    handleError(error, "INVALID_OUTPUT_PATH", emitOpts.format);
  }

  const modelConfig = MODELS[modelId];
  if (!modelConfig) {
    emitError(
      {
        code: "UNKNOWN_MODEL",
        details: { available: GENERATION_MODELS },
        message: `Unknown model: ${modelId}`,
      },
      emitOpts.format
    );
    exitForErrorCode("UNKNOWN_MODEL");
  }

  const editPaths = resolveEditPaths(
    options.edit ?? stdinData?.editImages,
    modelConfig,
    emitOpts.format
  );

  // A transparent request on a model whose fal endpoint cannot produce one
  // runs through the model's direct provider route instead (gpt2 via OpenAI).
  const transparent = options.transparent ?? stdinData?.transparent;
  const openAiRoute: ProviderRoute | undefined =
    transparent === true ? modelConfig.transparencyRoute : undefined;
  const routePrice =
    openAiRoute === undefined
      ? undefined
      : providerPricePerImageUsd(openAiRoute.provider, openAiRoute.model);
  let cost: number | null;
  if (openAiRoute === undefined) {
    cost = estimateCost(modelId, resolution, numImages);
  } else {
    cost = routePrice === undefined ? null : routePrice * numImages;
  }

  // Resolve new advanced generation params from CLI flags + stdin
  const seed = validateOption(emitOpts.format, () =>
    options.seed !== undefined || stdinData?.seed !== undefined
      ? parseIntegerOption(options.seed ?? stdinData?.seed ?? 0, "seed")
      : undefined
  );
  const negativePrompt = firstText(options.negative, stdinData?.negativePrompt);
  const style = firstText(options.style, stdinData?.style);
  const outputFormat = validateOption(emitOpts.format, () =>
    hasText(options.outputFormat) || hasText(stdinData?.outputFormat)
      ? validateEnumOption(
          options.outputFormat ?? stdinData?.outputFormat ?? "",
          OUTPUT_FORMATS,
          "output format"
        )
      : undefined
  );
  const background = validateOption(emitOpts.format, () =>
    hasText(options.background) || hasText(stdinData?.background)
      ? validateEnumOption(
          options.background ?? stdinData?.background ?? "",
          BACKGROUND_MODES,
          "background"
        )
      : undefined
  );
  const quality = validateOption(emitOpts.format, () =>
    hasText(options.quality) || hasText(stdinData?.quality)
      ? validateEnumOption(
          options.quality ?? stdinData?.quality ?? "",
          QUALITY_LEVELS,
          "quality"
        )
      : undefined
  );
  if (
    outputFormat &&
    modelConfig.supportedOutputFormats &&
    !modelConfig.supportedOutputFormats.includes(outputFormat)
  ) {
    handleError(
      new Error(
        `${modelConfig.name} supports output formats: ${modelConfig.supportedOutputFormats.join(", ")}`
      ),
      "INVALID_OPTION",
      emitOpts.format
    );
  }
  const safetyTolerance = validateOption(emitOpts.format, () =>
    hasText(options.safety) || hasText(stdinData?.safetyTolerance)
      ? validateEnumOption(
          options.safety ?? stdinData?.safetyTolerance ?? "",
          SAFETY_LEVELS,
          "safety tolerance"
        )
      : undefined
  );
  const enableWebSearch = options.webSearch ?? stdinData?.enableWebSearch;
  const enableGoogleSearch =
    options.googleSearch ?? stdinData?.enableGoogleSearch;
  const enableSafetyChecker =
    options.disableSafetyChecker === true
      ? false
      : (options.safetyChecker ?? stdinData?.enableSafetyChecker);
  const syncMode = options.syncMode ?? stdinData?.syncMode;
  const imageSize = validateOption(emitOpts.format, () =>
    parseImageSizeOption(options.imageSize ?? stdinData?.imageSize)
  );
  const maskImageUrl = options.mask ?? stdinData?.maskImageUrl;
  const limitGenerations =
    options.disableLimitGenerations === true
      ? false
      : (options.limitGenerations ?? stdinData?.limitGenerations);
  const imagePromptStrength = validateOption(emitOpts.format, () =>
    options.imagePromptStrength !== undefined ||
    stdinData?.imagePromptStrength !== undefined
      ? parseNumberOption(
          options.imagePromptStrength ?? stdinData?.imagePromptStrength ?? 0,
          "image prompt strength",
          { max: 1, min: 0 }
        )
      : undefined
  );
  const thinkingLevel = validateOption(emitOpts.format, () =>
    hasText(options.thinking) || hasText(stdinData?.thinkingLevel)
      ? validateEnumOption(
          options.thinking ?? stdinData?.thinkingLevel ?? "",
          THINKING_LEVELS,
          "thinking level"
        )
      : undefined
  );
  const guidanceScale = validateOption(emitOpts.format, () =>
    options.guidanceScale !== undefined ||
    stdinData?.guidanceScale !== undefined
      ? parseNumberOption(
          options.guidanceScale ?? stdinData?.guidanceScale ?? 0,
          "guidance scale",
          { max: 20, min: 1 }
        )
      : undefined
  );
  const numInferenceSteps = validateOption(emitOpts.format, () =>
    options.steps !== undefined || stdinData?.numInferenceSteps !== undefined
      ? parseIntegerOption(
          options.steps ?? stdinData?.numInferenceSteps ?? 0,
          "inference steps",
          { max: 12, min: 1 }
        )
      : undefined
  );
  const raw = options.raw ?? stdinData?.raw;
  const enhancePrompt = options.enhancePrompt ?? stdinData?.enhancePrompt;
  const renderingSpeed = validateOption(emitOpts.format, () =>
    hasText(options.renderingSpeed) || hasText(stdinData?.renderingSpeed)
      ? validateEnumOption(
          options.renderingSpeed ?? stdinData?.renderingSpeed ?? "",
          RENDERING_SPEEDS,
          "rendering speed"
        )
      : undefined
  );
  const expandPrompt = options.expandPrompt ?? stdinData?.expandPrompt;
  const ephemeral = options.ephemeral ?? stdinData?.ephemeral;
  const inputFidelity =
    options.loose === true ? "low" : stdinData?.inputFidelity;
  const history = {
    aspect,
    editPaths,
    look: typeof creative?.look === "string" ? creative.look : undefined,
    model: modelId,
    mood: typeof creative?.mood === "string" ? creative.mood : undefined,
    prompt: requestPrompt,
    resolution,
  };

  const routeRequest: RouteRequest = {
    editPaths,
    inputFidelity,
    mask: hasText(maskImageUrl) ? maskImageUrl : undefined,
    n: numImages,
    prompt: requestPrompt,
    quality,
    size: aspectToGptSize(aspect),
  };
  const dryRunGenerateOptions: GenerateOptions = {
    aspect,
    background,
    creative,
    editImageUrls: editPaths,
    enableGoogleSearch,
    enableSafetyChecker,
    enableWebSearch,
    enhancePrompt,
    ephemeral,
    expandPrompt,
    guidanceScale,
    imagePromptStrength,
    imageSize,
    inputFidelity,
    limitGenerations,
    maskImageUrl,
    model: modelId,
    negativePrompt,
    numImages,
    numInferenceSteps,
    outputFormat,
    prompt,
    quality,
    raw,
    renderingSpeed,
    resolution,
    safetyTolerance,
    seed,
    style,
    syncMode,
    thinkingLevel,
    transparent,
  };
  if (openAiRoute !== undefined) {
    validateRoute(
      openAiRoute,
      modelConfig.name,
      dryRunGenerateOptions,
      routeRequest,
      emitOpts.format
    );
  }
  const requestPreview =
    openAiRoute === undefined
      ? validateOption(emitOpts.format, () =>
          buildGenerateBody(dryRunGenerateOptions)
        )
      : routePreview(openAiRoute, routeRequest);

  // -- Dry run --
  if (options.dryRun === true) {
    const dryResult = {
      dryRun: true,
      command: "generate",
      prompt: requestPrompt,
      warnings,
      ...(creativeResult && {
        basePrompt: creativeResult.basePrompt,
        creative: creativeResult.creative,
      }),
      model: modelId,
      modelName: modelConfig.name,
      aspect,
      resolution,
      numImages,
      output: outputPath,
      editImages: editPaths,
      transparent,
      inputFidelity,
      route: openAiRoute === undefined ? "fal" : openAiRoute.provider,
      ...(openAiRoute !== undefined &&
        routeDryRunFields(openAiRoute, routePrice)),
      endpoint: requestPreview.endpoint,
      body: requestPreview.body,
      ephemeral,
      historyRecorded: ephemeral !== true,
      storeIo: ephemeral !== true,
      // New fields — only include when set
      ...(seed !== undefined && { seed }),
      ...(hasText(background) && { background }),
      ...(hasText(quality) && { quality }),
      ...(hasText(negativePrompt) && { negativePrompt }),
      ...(hasText(style) && { style }),
      ...(hasText(outputFormat) && { outputFormat }),
      ...(hasText(safetyTolerance) && { safetyTolerance }),
      ...(enableWebSearch === true && { enableWebSearch }),
      ...(enableGoogleSearch === true && { enableGoogleSearch }),
      ...(enableSafetyChecker !== undefined && { enableSafetyChecker }),
      ...(syncMode === true && { syncMode }),
      ...(imageSize !== undefined && { imageSize }),
      ...(imagePromptStrength !== undefined && { imagePromptStrength }),
      ...(hasText(maskImageUrl) && { maskImageUrl }),
      ...(limitGenerations !== undefined && { limitGenerations }),
      ...(hasText(thinkingLevel) && { thinkingLevel }),
      ...(guidanceScale !== undefined && { guidanceScale }),
      ...(numInferenceSteps !== undefined && { numInferenceSteps }),
      ...(raw === true && { raw }),
      ...(enhancePrompt === true && { enhancePrompt }),
      ...(hasText(renderingSpeed) && { renderingSpeed }),
      ...(expandPrompt !== undefined && { expandPrompt }),
      estimatedCost: cost,
      valid: true,
    };
    emit(dryResult, emitOpts);
    if (!isStructured(emitOpts.format)) {
      console.log(chalk.bold("\n🔍 Dry run — no API call made\n"));
      console.log(`  Model:  ${chalk.green(modelConfig.name)}`);
      if (openAiRoute !== undefined) {
        console.log(
          `  Route:  ${openAiRoute.provider} (${openAiRoute.model}), needs ${openAiRoute.apiKeyEnv}`
        );
      }
      console.log(`  Aspect: ${aspect} | Resolution: ${resolution}`);
      console.log(`  Images: ${numImages}`);
      console.log(`  Output: ${chalk.dim(outputPath)}`);
      console.log(`  Cost:   ${chalk.yellow(formatCost(cost))}`);
      printPromptWarnings(warnings);
      if (ephemeral === true) {
        console.log("  Fal IO: not retained after local download");
      }
      if (editPaths) {
        console.log(`  Edit:   ${chalk.dim(editPaths.join(", "))}`);
      }
    }
    return;
  }

  // -- API key for the route in use --
  if (openAiRoute === undefined) {
    try {
      getApiKey(config);
    } catch (error) {
      handleError(error, "MISSING_API_KEY", emitOpts.format);
    }
  } else {
    requireRouteKey(openAiRoute, modelConfig.name, emitOpts.format);
  }

  // -- Human progress output --
  if (!isStructured(emitOpts.format)) {
    console.log(chalk.bold(`\nModel: ${modelConfig.name}`));
    if (modelConfig.supportsAspect) {
      console.log(
        `Aspect: ${aspect} | Resolution: ${modelConfig.supportsResolution ? resolution : "N/A"}`
      );
    }
    console.log(
      `Prompt: ${chalk.dim(requestPrompt.slice(0, 80))}${requestPrompt.length > 80 ? "..." : ""}`
    );
    if (openAiRoute !== undefined) {
      console.log(`Route: ${openAiRoute.provider} (${openAiRoute.model})`);
    }
    console.log(`Est. cost: ${chalk.yellow(formatCost(cost))}`);
    printPromptWarnings(warnings);
    if (ephemeral === true && openAiRoute === undefined) {
      console.log("Fal IO: not retained after local download");
    }
    if (editPaths) {
      console.log(`References: ${chalk.dim(editPaths.join(", "))}`);
    }
  }

  const spinner = isStructured(emitOpts.format)
    ? null
    : ora("Generating...").start();

  const noOpen = options.noOpen === true || stdinData?.noOpen === true;

  try {
    if (openAiRoute !== undefined) {
      const { costPerImage, result } = await runRoute(
        openAiRoute,
        routeRequest
      );
      spinner?.succeed("Generated!");
      const saved = await saveGeneratedImages(
        result.images.map((image) => ({ bytes: image.uint8Array })),
        outputPath,
        numImages,
        {
          ...history,
          costPerImage,
          requireTransparency: true,
        },
        config,
        emitOpts,
        noOpen,
        ephemeral !== true
      );
      if (isStructured(emitOpts.format)) {
        emit(
          {
            command: "generate",
            ...saved,
            ephemeral,
            prompt: requestPrompt,
            warnings,
            ...(creativeResult && {
              basePrompt: creativeResult.basePrompt,
              creative: creativeResult.creative,
            }),
            model: modelId,
            modelName: modelConfig.name,
            route: openAiRoute.provider,
            provider: openAiRoute.provider,
            providerModel: result.model,
            ...(hasText(result.requestId) && { requestId: result.requestId }),
            ...(result.warnings !== undefined && {
              providerWarnings: result.warnings,
            }),
            aspect,
            resolution,
            numImages,
          },
          emitOpts
        );
      }
      return;
    }

    const result = await generate({
      aspect,
      background,
      creative,
      editImages: editPaths,
      enableGoogleSearch,
      enableSafetyChecker,
      enableWebSearch,
      enhancePrompt,
      ephemeral,
      expandPrompt,
      guidanceScale,
      imagePromptStrength,
      imageSize,
      inputFidelity,
      limitGenerations,
      maskImageUrl,
      model: modelId,
      negativePrompt,
      numImages,
      numInferenceSteps,
      outputFormat,
      prompt,
      quality,
      raw,
      renderingSpeed,
      resolution,
      safetyTolerance,
      seed,
      style,
      syncMode,
      thinkingLevel,
      transparent,
    });

    spinner?.succeed("Generated!");

    const saved = await saveGeneratedImages(
      result.images,
      outputPath,
      numImages,
      { ...history, requireTransparency: transparent === true },
      config,
      emitOpts,
      noOpen,
      ephemeral !== true
    );

    const { payloadDeleteError, payloadsDeleted } =
      ephemeral === true
        ? await deleteEphemeralPayloads(result.requestId, emitOpts.format)
        : { payloadDeleteError: undefined, payloadsDeleted: false };

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "generate",
          ...saved,
          ephemeral,
          ...(ephemeral === true && {
            payloadsDeleted,
            requestId: result.requestId,
            storeIo: false,
          }),
          ...(hasText(payloadDeleteError) && { payloadDeleteError }),
          prompt: requestPrompt,
          warnings,
          ...(creativeResult && {
            basePrompt: creativeResult.basePrompt,
            creative: creativeResult.creative,
          }),
          model: modelId,
          modelName: modelConfig.name,
          route: "fal",
          aspect,
          resolution,
          numImages,
        },
        emitOpts
      );
    }
  } catch (error) {
    spinner?.fail("Generation failed");
    exitIfTransparencyMissing(error, emitOpts.format);
    handleError(error, "GENERATION_FAILED", emitOpts.format);
  }
}
