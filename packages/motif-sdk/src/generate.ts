import {
  aspectToFalImageSize,
  aspectToGptSize,
  boundedImageSize,
  FAL_PRESET_ASPECTS,
  FAL_PRESET_LONG_EDGE,
  ImageSizeBoundsError,
  RESOLUTION_LONG_EDGE,
} from "./aspects";
import { outputFormatsOf, UnsupportedOptionError } from "./capabilities";
import type { ModelOption } from "./capabilities";
import { enrichPrompt } from "./creative";
import { MODELS } from "./models";
import type {
  AspectRatio,
  CustomImageSize,
  GenerateOptions,
  ImageSize,
  ModelConfig,
  Resolution,
  SizeMode,
} from "./types";

const GPT_IMAGE_SIZES = ["auto", "1024x1024", "1536x1024", "1024x1536"];
const FAL_IMAGE_SIZE_PRESETS = [
  "auto",
  "square_hd",
  "square",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9",
];

function normalizeImageSize(
  imageSize: ImageSize | undefined,
  sizeMode: SizeMode
): ImageSize | undefined {
  if (imageSize === undefined) {
    return undefined;
  }

  if (typeof imageSize !== "string") {
    if (sizeMode === "gpt_size") {
      throw new Error("GPT Image 1.5 image_size must be auto or a fixed size");
    }
    return imageSize;
  }

  if (sizeMode === "gpt_size") {
    if (!GPT_IMAGE_SIZES.includes(imageSize)) {
      throw new Error(
        `GPT Image 1.5 image_size must be one of ${GPT_IMAGE_SIZES.join(", ")}`
      );
    }
    return imageSize;
  }

  if (FAL_IMAGE_SIZE_PRESETS.includes(imageSize)) {
    return imageSize;
  }

  const match = /^(\d+)x(\d+)$/.exec(imageSize);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    return { height, width };
  }

  throw new Error(
    `fal image_size must be one of ${FAL_IMAGE_SIZE_PRESETS.join(", ")} or WIDTHxHEIGHT`
  );
}

/**
 * `image_size` for an aspect: exact dimensions at the requested resolution
 * where the endpoint takes them and has a resolution setting; otherwise fal's
 * named preset where one holds the ratio exactly, else exact dimensions where
 * the endpoint takes them, else the nearest preset. A Model without a resolution setting is sized to the preset
 * long edge, so an exact size costs what a preset would. Out of the Model's
 * limits it throws rather than rounding to another ratio.
 */
function falImageSizeFor(
  config: ModelConfig,
  aspect: AspectRatio,
  resolution: Resolution
): CustomImageSize | string {
  const bounds = config.customImageSize;
  if (
    bounds === undefined ||
    (!config.supportsResolution && FAL_PRESET_ASPECTS.includes(aspect))
  ) {
    return aspectToFalImageSize(aspect);
  }
  const longEdge = config.supportsResolution
    ? RESOLUTION_LONG_EDGE[resolution]
    : FAL_PRESET_LONG_EDGE;
  const size = boundedImageSize(aspect, longEdge, bounds);
  if (size === undefined) {
    throw new ImageSizeBoundsError(config.name, aspect, bounds);
  }
  return size ?? aspectToFalImageSize(aspect);
}

function unsupported(config: ModelConfig, option: ModelOption): never {
  throw new UnsupportedOptionError(config, option);
}

function validateGenerateOptions(
  options: GenerateOptions,
  config: ModelConfig,
  sizeMode: SizeMode,
  hasEditImages: boolean
): void {
  if (
    options.editImageUrls !== undefined &&
    options.editImageUrls.length > 0 &&
    config.maxReferenceImages !== undefined &&
    options.editImageUrls.length > config.maxReferenceImages
  ) {
    throw new Error(
      `${config.name} supports at most ${config.maxReferenceImages} reference images`
    );
  }

  if (
    options.editImageUrls !== undefined &&
    options.editImageUrls.length > 0 &&
    !config.supportsEdit
  ) {
    unsupported(config, "image editing");
  }
  if (options.aspect !== undefined && sizeMode === "none") {
    unsupported(config, "aspect");
  }
  if (options.resolution !== undefined && !config.supportsResolution) {
    unsupported(config, "resolution");
  }
  // An edit with no aspect is sized from its source ("auto"), which has no
  // resolution to honour.
  if (
    config.autoEditSize === true &&
    hasEditImages &&
    options.aspect === undefined &&
    options.imageSize === undefined &&
    options.resolution !== undefined
  ) {
    throw new Error(
      `${config.name} sizes an edit from its source image; pass an aspect with resolution`
    );
  }
  if (
    options.aspect !== undefined &&
    config.supportedAspects !== undefined &&
    !config.supportedAspects.includes(options.aspect)
  ) {
    throw new Error(
      `${config.name} aspect must be one of ${config.supportedAspects.join(", ")}`
    );
  }
  if (
    options.resolution !== undefined &&
    config.supportedResolutions !== undefined &&
    !config.supportedResolutions.includes(options.resolution)
  ) {
    throw new Error(
      `${config.name} resolution must be one of ${config.supportedResolutions.join(", ")}`
    );
  }
  if (
    options.numImages !== undefined &&
    options.numImages !== 1 &&
    !config.supportsNumImages
  ) {
    unsupported(config, "numImages");
  }
  // A transparent-only endpoint has no `background` parameter, but asking it
  // for a transparent background is asking for what it always returns.
  const transparentOnly =
    config.transparentOutput === true && options.background === "transparent";
  if (
    options.background !== undefined &&
    config.supportsBackground !== true &&
    !transparentOnly
  ) {
    unsupported(config, "background");
  }
  // Transparency needs a `background` parameter. `supportsOutputFormat` only
  // buys a PNG container, which is opaque unless the model was asked for an
  // alpha channel — accepting it here returned an opaque image for a request
  // that said transparent, and charged for it.
  if (
    options.transparent === true &&
    config.supportsBackground !== true &&
    config.transparentOutput !== true
  ) {
    unsupported(config, "transparent output");
  }
  if (options.inputFidelity !== undefined) {
    if (!hasEditImages) {
      throw new Error("inputFidelity requires editImageUrls");
    }
    if (config.sizeMode !== "gpt_size") {
      unsupported(config, "inputFidelity");
    }
  }
  if (
    options.imageSize !== undefined &&
    sizeMode !== "gpt_size" &&
    sizeMode !== "image_size_enum"
  ) {
    unsupported(config, "imageSize");
  }
  if (options.maskImageUrl !== undefined && config.supportsMaskImage !== true) {
    unsupported(config, "maskImageUrl");
  }
  if (options.maskImageUrl !== undefined && !hasEditImages) {
    throw new Error("maskImageUrl requires editImageUrls");
  }
  if (
    options.markupImageUrl !== undefined &&
    config.supportsMarkupImage !== true
  ) {
    unsupported(config, "markupImageUrl");
  }
  if (options.markupImageUrl !== undefined && !hasEditImages) {
    throw new Error("markupImageUrl requires editImageUrls");
  }
  if (
    options.markupImageUrl !== undefined &&
    options.maskImageUrl !== undefined
  ) {
    throw new Error("A markup image can't be combined with a mask.");
  }
  if (options.seed !== undefined && config.supportsSeed !== true) {
    unsupported(config, "seed");
  }
  if (
    options.outputFormat !== undefined &&
    config.supportsOutputFormat !== true
  ) {
    if (config.fixedOutputFormat === undefined) {
      unsupported(config, "outputFormat");
    }
    if (options.outputFormat !== config.fixedOutputFormat) {
      throw new Error(
        `${config.name} always returns ${config.fixedOutputFormat}, not ${options.outputFormat}`
      );
    }
  }
  if (options.quality !== undefined && config.supportsQuality !== true) {
    unsupported(config, "quality");
  }
  if (options.quality !== undefined) {
    const qualities = config.supportedQualities ?? [
      "auto",
      "low",
      "medium",
      "high",
    ];
    if (!qualities.includes(options.quality)) {
      throw new Error(
        `${config.name} quality must be one of ${qualities.join(", ")}`
      );
    }
  }
  if (
    options.negativePrompt !== undefined &&
    config.supportsNegativePrompt !== true
  ) {
    unsupported(config, "negativePrompt");
  }
  if (options.syncMode !== undefined && config.supportsSyncMode !== true) {
    unsupported(config, "syncMode");
  }
  if (
    options.renderingSpeed !== undefined &&
    config.supportsRenderingSpeed !== true
  ) {
    unsupported(config, "renderingSpeed");
  }
  if (
    options.guidanceScale !== undefined &&
    config.supportsGuidanceScale !== true
  ) {
    unsupported(config, "guidanceScale");
  }
  if (
    options.numInferenceSteps !== undefined &&
    config.supportsInferenceSteps !== true
  ) {
    unsupported(config, "numInferenceSteps");
  }
  if (
    options.safetyTolerance !== undefined &&
    config.supportsSafetyTolerance !== true
  ) {
    unsupported(config, "safetyTolerance");
  }
  if (
    options.enableWebSearch !== undefined &&
    config.supportsWebSearch !== true
  ) {
    unsupported(config, "enableWebSearch");
  }
  if (
    options.enableGoogleSearch !== undefined &&
    config.supportsGoogleSearch !== true
  ) {
    unsupported(config, "enableGoogleSearch");
  }
  if (
    options.enableSafetyChecker !== undefined &&
    config.supportsSafetyChecker !== true
  ) {
    unsupported(config, "enableSafetyChecker");
  }
  if (
    options.limitGenerations !== undefined &&
    config.supportsLimitGenerations !== true
  ) {
    unsupported(config, "limitGenerations");
  }
  if (
    options.thinkingLevel !== undefined &&
    config.supportsThinkingLevel !== true
  ) {
    unsupported(config, "thinkingLevel");
  }
  if (
    options.expandPrompt !== undefined &&
    config.supportsExpandPrompt !== true
  ) {
    unsupported(config, "expandPrompt");
  }
}

/**
 * Build the fal.ai request body for a generation request.
 * Shared between sync generate() (CLI) and queue-based submit (web).
 *
 * Models use different sizing APIs:
 * - `gpt_size`: GPT's fixed dimensions (1024x1024, 1536x1024, etc.)
 * - `aspect_ratio`: string like "16:9" (Gemini, Grok, FLUX Pro Ultra)
 * - `image_size_enum`: named presets like "landscape_4_3" (FLUX.2, Seedream, Recraft, Ideogram, GPT Image)
 * - `none`: no size control (video models)
 */
export function buildGenerateBody(options: GenerateOptions): {
  endpoint: string;
  body: Record<string, unknown>;
} {
  const {
    prompt,
    model,
    creative,
    aspect = "1:1",
    resolution = "2K",
    numImages = 1,
    background,
    editImageUrls,
    enableGoogleSearch,
    enableSafetyChecker,
    transparent,
    inputFidelity,
    imageSize,
    limitGenerations,
    maskImageUrl,
    markupImageUrl,
    seed,
    outputFormat,
    quality,
    negativePrompt,
    syncMode,
    thinkingLevel,
    renderingSpeed,
    guidanceScale,
    numInferenceSteps,
    safetyTolerance,
    enableWebSearch,
    expandPrompt,
  } = options;

  const config = MODELS[model];
  if (!config) {
    throw new Error(`Unknown model: ${model}`);
  }

  let { endpoint } = config;
  const enrichedPrompt = creative
    ? enrichPrompt({ creative, prompt }).prompt
    : prompt;
  const body: Record<string, unknown> = { prompt: enrichedPrompt };
  const hasEditImages = Boolean(editImageUrls?.length);
  const editImages = editImageUrls ?? [];
  const explicitAspect = options.aspect !== undefined;

  // Apply dimension control based on model's size mode
  const sizeMode = config.sizeMode ?? "aspect_ratio";
  validateGenerateOptions(options, config, sizeMode, hasEditImages);
  const normalizedImageSize = normalizeImageSize(imageSize, sizeMode);

  switch (sizeMode) {
    case "gpt_size": {
      body.image_size =
        normalizedImageSize ??
        (hasEditImages && !explicitAspect ? "auto" : aspectToGptSize(aspect));
      break;
    }

    case "image_size_enum": {
      body.image_size =
        normalizedImageSize ??
        (config.autoEditSize === true && hasEditImages && !explicitAspect
          ? "auto"
          : falImageSizeFor(config, aspect, resolution));
      break;
    }

    case "aspect_ratio": {
      if (config.supportsAspect) {
        body.aspect_ratio = aspect;
      }
      if (config.supportsResolution) {
        body.resolution =
          config.lowercaseResolution === true
            ? resolution.toLowerCase()
            : resolution;
      }
      break;
    }

    case "none": {
      break;
    }
  }

  if (config.supportsQuality === true) {
    body.quality = quality ?? config.defaultQuality ?? "high";
  }

  if (config.supportsBackground === true && background) {
    body.background = background;
  }
  if (config.supportsBackground === true && transparent === true) {
    body.background = "transparent";
  }

  if (syncMode !== undefined && config.supportsSyncMode === true) {
    body.sync_mode = syncMode;
  }

  // ── Seed ──────────────────────────────────────────────────────────
  if (seed !== undefined && config.supportsSeed === true) {
    body.seed = seed;
  }

  // ── Output format ──────────────────────────────────────────────────
  // A transparent image with no format asked for is a PNG.
  const format = outputFormat ?? (transparent === true ? "png" : undefined);
  if (format && config.supportsOutputFormat === true) {
    const formats = outputFormatsOf(config, hasEditImages);
    if (!formats.includes(format)) {
      throw new Error(
        `${config.name} ${hasEditImages ? "edits support" : "supports"} output formats: ${formats.join(", ")}`
      );
    }
    body.output_format = format;
  }

  if (config.supportsGuidanceScale === true && guidanceScale !== undefined) {
    body.guidance_scale = guidanceScale;
  }
  if (
    config.supportsInferenceSteps === true &&
    numInferenceSteps !== undefined
  ) {
    body.num_inference_steps = numInferenceSteps;
  }

  // ── Shared safety / web-search controls ────────────────────────────
  if (config.supportsSafetyTolerance === true) {
    if (safetyTolerance !== undefined && safetyTolerance !== "") {
      body.safety_tolerance = safetyTolerance;
    }
  }
  if (config.supportsWebSearch === true) {
    if (enableWebSearch !== undefined) {
      body.enable_web_search = enableWebSearch;
    }
  }
  if (config.supportsGoogleSearch === true) {
    if (enableGoogleSearch !== undefined) {
      body.enable_google_search = enableGoogleSearch;
    }
  }
  if (config.supportsSafetyChecker === true) {
    if (enableSafetyChecker !== undefined) {
      body.enable_safety_checker = enableSafetyChecker;
    }
  }
  if (config.supportsLimitGenerations === true) {
    if (limitGenerations !== undefined) {
      body.limit_generations = limitGenerations;
    }
  }
  if (config.supportsThinkingLevel === true) {
    if (thinkingLevel) {
      body.thinking_level = thinkingLevel;
    }
  }

  // ── Ideogram: negative_prompt, rendering_speed, expand_prompt
  if (config.supportsNegativePrompt === true) {
    if (negativePrompt !== undefined && negativePrompt !== "") {
      body.negative_prompt = negativePrompt;
    }
  }
  if (config.supportsRenderingSpeed === true) {
    if (renderingSpeed) {
      body.rendering_speed = renderingSpeed;
    }
  }
  if (config.supportsExpandPrompt === true) {
    if (expandPrompt !== undefined) {
      body.expand_prompt = expandPrompt;
    }
  }

  if (config.supportsNumImages) {
    body.num_images = numImages;
  }

  if (hasEditImages && sizeMode !== "gpt_size") {
    if (!config.supportsEdit) {
      throw new Error(`Model ${model} does not support image editing`);
    }
    endpoint = config.editEndpoint ?? `${endpoint}/edit`;
    const editImagesField = config.editImagesField ?? "image_urls";
    body[editImagesField] =
      editImagesField === "image_url" ? editImages[0] : editImages;
  }

  // GPT Image 1 edit mode
  if (hasEditImages && sizeMode === "gpt_size") {
    endpoint = config.editEndpoint ?? `${endpoint}/edit`;
    body.image_urls = editImages;
    if (inputFidelity) {
      body.input_fidelity = inputFidelity;
    }
  }

  if (
    maskImageUrl !== undefined &&
    maskImageUrl !== "" &&
    config.supportsMaskImage === true
  ) {
    body[config.maskImageField ?? "mask_image_url"] = maskImageUrl;
  }
  if (markupImageUrl !== undefined && config.supportsMarkupImage === true) {
    body.markup_image_url = markupImageUrl;
  }

  return { body, endpoint };
}
