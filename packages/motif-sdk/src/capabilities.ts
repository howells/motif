/**
 * Which generation options each model accepts, derived from the registry.
 *
 * Keys are the option names used in unsupported-option errors. Each test reads
 * the same `ModelConfig` flag `buildGenerateBody` validates against, so an
 * error can name both what a model does support and which models support the
 * option that was refused.
 */

import { GENERATION_MODELS, MODELS } from "./models";
import type { ImageOutputFormat, ModelConfig } from "./types";

const DEFAULT_OUTPUT_FORMATS: readonly ImageOutputFormat[] = [
  "jpeg",
  "png",
  "webp",
];

/** The format every Model that can make one returns when none is asked for. */
export const DEFAULT_OUTPUT_FORMAT = "png" satisfies ImageOutputFormat;

/** Formats with no alpha channel, so a transparent image cannot be kept in them. */
export const OPAQUE_OUTPUT_FORMATS: readonly ImageOutputFormat[] = ["jpeg"];

/** The output formats a Model returns, for an edit when `editing` is set.
 * A Model that takes no format returns none it can be asked for, except the
 * one it always returns. */
export function outputFormatsOf(
  config: ModelConfig,
  editing: boolean
): readonly ImageOutputFormat[] {
  if (config.supportsOutputFormat !== true) {
    return config.fixedOutputFormat === undefined
      ? []
      : [config.fixedOutputFormat];
  }
  const formats = config.supportedOutputFormats ?? DEFAULT_OUTPUT_FORMATS;
  return editing ? (config.supportedEditOutputFormats ?? formats) : formats;
}

interface CountLimits {
  readonly maxCount?: number;
  readonly name: string;
  readonly singleImageFormats?: readonly string[];
}

/**
 * The most images one request may ask for: 1 for an output format that makes
 * one, else the Model's maximum. Absent where no maximum is known.
 */
export function countLimit(
  limits: CountLimits,
  format?: string
): number | undefined {
  const single =
    format !== undefined &&
    limits.singleImageFormats?.some((candidate) => candidate === format) ===
      true;
  return single ? 1 : limits.maxCount;
}

/** Why a request for `count` images is too many for the Model, if it is. */
export function countRefusal(
  limits: CountLimits,
  count: number,
  format?: string
): string | undefined {
  const limit = countLimit(limits, format);
  if (limit === undefined || count <= limit) {
    return undefined;
  }
  const noun = limit === 1 ? "image" : "images";
  const as = limit === 1 && limits.maxCount !== 1 ? ` as ${format}` : "";
  return `${limits.name} makes at most ${limit} ${noun} per request${as}, not ${count}.`;
}

type Capability = (config: ModelConfig) => boolean;

/** Generation options a model can refuse, with the registry test for each. */
export const OPTION_CAPABILITIES = {
  aspect: (config) => (config.sizeMode ?? "aspect_ratio") !== "none",
  background: (config) => config.supportsBackground === true,
  enableGoogleSearch: (config) => config.supportsGoogleSearch === true,
  enableSafetyChecker: (config) => config.supportsSafetyChecker === true,
  enableWebSearch: (config) => config.supportsWebSearch === true,
  expandPrompt: (config) => config.supportsExpandPrompt === true,
  guidanceScale: (config) => config.supportsGuidanceScale === true,
  "image editing": (config) => config.supportsEdit,
  imageSize: (config) =>
    config.sizeMode === "gpt_size" || config.sizeMode === "image_size_enum",
  inputFidelity: (config) => config.sizeMode === "gpt_size",
  limitGenerations: (config) => config.supportsLimitGenerations === true,
  markupImageUrl: (config) => config.supportsMarkupImage === true,
  maskImageUrl: (config) => config.supportsMaskImage === true,
  negativePrompt: (config) => config.supportsNegativePrompt === true,
  numImages: (config) => config.supportsNumImages,
  numInferenceSteps: (config) => config.supportsInferenceSteps === true,
  outputFormat: (config) => config.supportsOutputFormat === true,
  quality: (config) => config.supportsQuality === true,
  renderingSpeed: (config) => config.supportsRenderingSpeed === true,
  resolution: (config) => config.supportsResolution,
  safetyTolerance: (config) => config.supportsSafetyTolerance === true,
  seed: (config) => config.supportsSeed === true,
  syncMode: (config) => config.supportsSyncMode === true,
  thinkingLevel: (config) => config.supportsThinkingLevel === true,
  "transparent output": (config) =>
    config.supportsBackground === true || config.transparentOutput === true,
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
  /** Display name of the model that refused, e.g. `"Seedream 5 Pro"`. */
  readonly model: string;
  /** Generation model ids that accept `option`. */
  readonly modelsSupporting: string[];
  readonly option: ModelOption;
  /** Refusable options this model does accept. */
  readonly supportedOptions: ModelOption[];

  constructor(config: ModelConfig, option: ModelOption) {
    const models = modelsSupporting(option);
    const supported = supportedOptions(config);
    super(
      `${config.name} does not support ${option}. Models that do: ${models.length > 0 ? models.join(", ") : "none"}. ${config.name} supports: ${supported.length > 0 ? supported.join(", ") : "none of the optional settings"}.`
    );
    this.name = "UnsupportedOptionError";
    this.model = config.name;
    this.modelsSupporting = models;
    this.option = option;
    this.supportedOptions = supported;
  }
}
