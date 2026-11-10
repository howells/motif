/**
 * What each Model can carry, read from its registry entry: the capability
 * profile `resolveTask` filters a ranking by and `--describe` reports.
 */

import { outputFormatsOf } from "./capabilities";
import { generationSizing, toolSizing } from "./model-sizing";
import type { ModelSizing } from "./model-sizing";
import { MODELS } from "./models";
import type { Capability, RankedModel } from "./tasks";
import { falToolParameters } from "./tool-parameters.generated";
import type { FalToolConfig, ScaleRange } from "./tool-types";
import { FAL_TOOLS, isFalToolId } from "./tools";
import type { FalToolId } from "./tools";
import type { ModelConfig } from "./types";

export const FAL_KEY = "FAL_KEY";

export interface ModelProfile {
  /** The Model's display name, e.g. "GPT Image 2.6 Sunburst". */
  readonly name: string;
  readonly capabilities: ReadonlySet<Capability>;
  /** Key variables the Model needs for any request. */
  readonly keys: readonly string[];
  /** Most images one request makes. Absent where no maximum is known. */
  readonly maxCount?: number;
  readonly maxReferences: number;
  /** Aspect ratios the Model accepts. Absent means any. */
  readonly aspects?: readonly string[];
  /** Resolutions the Model accepts. Absent means any. */
  readonly resolutions?: readonly string[];
  /** Upscale factors the Model takes. Absent where its endpoint states no range. */
  readonly scaleRange?: ScaleRange;
  /** Output formats that make one image whatever the count. */
  readonly singleImageFormats?: readonly string[];
  /** What a resolution tier means for the Model, in pixels where known. */
  readonly sizing: ModelSizing;
  /** Output formats the Model returns, for a text request and an edit.
   * Absent means any. */
  readonly outputFormats?: {
    readonly edit: readonly string[];
    readonly text: readonly string[];
  };
}

function generationProfile(id: string, config: ModelConfig): ModelProfile {
  const capabilities = new Set<Capability>(["image"]);
  if (config.supportsBackground === true || config.transparentOutput === true) {
    capabilities.add("transparency");
  }
  if (config.supportsEdit) {
    capabilities.add("references");
  }
  if (config.supportsMaskImage === true) {
    capabilities.add("mask");
  }
  if (config.supportsMarkupImage === true) {
    capabilities.add("markup");
  }
  if ((config.sizeMode ?? "aspect_ratio") !== "none") {
    capabilities.add("aspect");
  }
  if (config.supportsResolution) {
    capabilities.add("resolution");
  }
  if (config.supportsNumImages) {
    capabilities.add("count");
  }
  if (config.supportsSeed === true) {
    capabilities.add("seed");
  }
  if (config.supportsNegativePrompt === true) {
    capabilities.add("negativePrompt");
  }
  if (
    config.supportsOutputFormat === true ||
    config.fixedOutputFormat !== undefined
  ) {
    capabilities.add("outputFormat");
  }
  return {
    name: config.name,
    aspects: config.supportedAspects,
    capabilities,
    keys: [FAL_KEY],
    maxCount: config.maxCount,
    maxReferences: config.supportsEdit ? (config.maxReferenceImages ?? 1) : 0,
    outputFormats: {
      edit: outputFormatsOf(config, true),
      text: outputFormatsOf(config, false),
    },
    resolutions: config.supportedResolutions,
    scaleRange: config.scaleRange,
    singleImageFormats: config.singleImageFormats,
    sizing: generationSizing(id, config),
  };
}

/**
 * Capabilities a fal tool takes, read from its generated parameter list: the
 * same list the task client maps request fields onto, so resolution and the
 * request body cannot disagree.
 */
const TOOL_PARAMETER_CAPABILITIES: readonly (readonly [
  Capability,
  readonly string[],
])[] = [
  ["aspect", ["aspect_ratio", "image_size"]],
  ["count", ["num_images"]],
  ["negativePrompt", ["negative_prompt"]],
  ["outputFormat", ["output_format"]],
  ["resolution", ["canvas_size", "image_size"]],
  ["rig", ["enable_rigging"]],
  ["seed", ["seed"]],
];

function toolProfile(tool: FalToolId): ModelProfile {
  const keys = new Set(
    falToolParameters(tool).map((parameter) => parameter.key)
  );
  const config: FalToolConfig = FAL_TOOLS[tool];
  const capabilities = new Set<Capability>([
    config.inputKind === "video" ? "video" : "image",
  ]);
  for (const [capability, parameters] of TOOL_PARAMETER_CAPABILITIES) {
    if (parameters.some((parameter) => keys.has(parameter))) {
      capabilities.add(capability);
    }
  }
  const takesReference = "referenceField" in config;
  if (takesReference) {
    capabilities.add("references");
  }
  return {
    name: config.name,
    capabilities,
    keys: [FAL_KEY],
    maxReferences: takesReference ? 1 : 0,
    scaleRange: config.scaleRange,
    sizing: toolSizing(tool),
  };
}

export function withEntry(
  profile: ModelProfile,
  entry: RankedModel
): ModelProfile {
  if (entry.supports === undefined) {
    return profile;
  }
  return {
    ...profile,
    capabilities: new Set([...profile.capabilities, ...entry.supports]),
  };
}

/** The profile for a Model id, or undefined when no registry knows it. */
export function modelProfile(model: string): ModelProfile | undefined {
  const config = MODELS[model];
  if (config !== undefined) {
    return generationProfile(model, config);
  }
  if (isFalToolId(model)) {
    return toolProfile(model);
  }
  return undefined;
}
