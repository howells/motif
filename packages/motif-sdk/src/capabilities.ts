/**
 * Which generation options each model accepts, derived from the registry.
 *
 * Keys are the option names used in unsupported-option errors. Each test reads
 * the same `ModelConfig` flag `buildGenerateBody` validates against, so an
 * error can name both what a model does support and which models support the
 * option that was refused.
 */

import { GENERATION_MODELS, MODELS } from "./models";
import type { ModelConfig } from "./types";

type Capability = (config: ModelConfig) => boolean;

/** Generation options a model can refuse, with the registry test for each. */
export const OPTION_CAPABILITIES = {
  aspect: (config) => (config.sizeMode ?? "aspect_ratio") !== "none",
  background: (config) => config.supportsBackground === true,
  enableGoogleSearch: (config) => config.supportsGoogleSearch === true,
  enableSafetyChecker: (config) => config.supportsSafetyChecker === true,
  enableWebSearch: (config) => config.supportsWebSearch === true,
  enhancePrompt: (config) => config.supportsEnhancePrompt === true,
  expandPrompt: (config) => config.supportsExpandPrompt === true,
  guidanceScale: (config) => config.supportsGuidanceScale === true,
  "image editing": (config) => config.supportsEdit,
  imagePromptStrength: (config) => config.supportsImagePromptStrength === true,
  imageSize: (config) =>
    config.sizeMode === "gpt_size" || config.sizeMode === "image_size_enum",
  inputFidelity: (config) =>
    config.sizeMode === "gpt_size" || config.name === "GPT Image 2",
  limitGenerations: (config) => config.supportsLimitGenerations === true,
  maskImageUrl: (config) => config.supportsMaskImage === true,
  negativePrompt: (config) => config.supportsNegativePrompt === true,
  numImages: (config) => config.supportsNumImages,
  numInferenceSteps: (config) => config.supportsInferenceSteps === true,
  outputFormat: (config) => config.supportsOutputFormat === true,
  quality: (config) => config.supportsQuality === true,
  raw: (config) => config.supportsRaw === true,
  renderingSpeed: (config) => config.supportsRenderingSpeed === true,
  resolution: (config) => config.supportsResolution,
  safetyTolerance: (config) => config.supportsSafetyTolerance === true,
  seed: (config) => config.supportsSeed === true,
  style: (config) => config.supportsStyle === true,
  syncMode: (config) => config.supportsSyncMode === true,
  thinkingLevel: (config) => config.supportsThinkingLevel === true,
  "transparent output": (config) => config.supportsBackground === true,
} as const satisfies Record<string, Capability>;

/** An option name a model can refuse, e.g. `"resolution"`. */
export type ModelOption = keyof typeof OPTION_CAPABILITIES;

function isModelOption(key: string): key is ModelOption {
  return Object.hasOwn(OPTION_CAPABILITIES, key);
}

const MODEL_OPTIONS = Object.keys(OPTION_CAPABILITIES).filter(isModelOption);

/** The refusable options this model accepts, in alphabetical order. */
export function supportedOptions(config: ModelConfig): ModelOption[] {
  return MODEL_OPTIONS.filter((option) => OPTION_CAPABILITIES[option](config));
}

/** Generation model ids that accept an option, in registry order. */
export function modelsSupporting(option: ModelOption): string[] {
  return GENERATION_MODELS.filter((id) => {
    const config = MODELS[id];
    return config !== undefined && OPTION_CAPABILITIES[option](config);
  });
}

/**
 * Error thrown when a model refuses a generation option.
 *
 * Carries code `INVALID_OPTION` plus the model's supported options and the
 * models that support the refused one, so callers can name the fix.
 */
export class UnsupportedOptionError extends Error {
  readonly code = "INVALID_OPTION";
  /** Display name of the model that refused, e.g. `"Seedream 4.5"`. */
  readonly model: string;
  /** Generation model ids that accept `option`. */
  readonly modelsSupporting: string[];
  readonly option: ModelOption;
  /** Refusable options this model does accept. */
  readonly supportedOptions: ModelOption[];

  constructor(config: ModelConfig, option: ModelOption) {
    const models = modelsSupporting(option);
    const supported = supportedOptions(config);
    const route =
      config.transparencyRoute !== undefined &&
      (option === "transparent output" || option === "background")
        ? ` ${config.name} does produce transparent PNGs through the ${config.transparencyRoute.provider} route (${config.transparencyRoute.apiKeyEnv}).`
        : "";
    super(
      `${config.name} does not support ${option}. Models that do: ${models.length > 0 ? models.join(", ") : "none"}. ${config.name} supports: ${supported.length > 0 ? supported.join(", ") : "none of the optional settings"}.${route}`
    );
    this.name = "UnsupportedOptionError";
    this.model = config.name;
    this.modelsSupporting = models;
    this.option = option;
    this.supportedOptions = supported;
  }
}
