/**
 * The direct provider route for generate: a transparent request on a model
 * whose fal endpoint cannot produce one (gpt2) runs through OpenAI instead.
 *
 * The route itself is registry metadata (`ModelConfig.transparencyRoute`);
 * this module validates the request for it, previews it for dry runs, checks
 * the key and runs it.
 */

import { getOpenAiKeyFromEnv } from "@howells/motif-sdk";
import type { GenerateOptions, ProviderRoute } from "@howells/motif-sdk";
import type { MotifImageResult } from "@howells/motif-sdk/image";

import { generateViaOpenAi, openAiProviderOptions } from "../api/openai-image";
import { exitForErrorCode, handleError } from "../utils/errors";
import { validateEditPath } from "../utils/input";
import { emitError } from "../utils/output";
import type { OutputFormat } from "../utils/output";
import { hasText } from "../utils/text";

/** What a route request carries: only what gpt-image takes. */
export interface RouteRequest {
  editPaths?: string[];
  inputFidelity?: "high" | "low";
  mask?: string;
  n: number;
  prompt: string;
  quality?: string;
  /** Pixel size such as `"1536x1024"`, or `"auto"`. */
  size: string;
}

const REMOTE_URL_REGEX = /^https?:\/\//i;

/**
 * Refuse options the route can't carry rather than dropping them silently,
 * and check a local mask exists.
 */
export function validateRoute(
  route: ProviderRoute,
  modelName: string,
  options: GenerateOptions,
  request: RouteRequest,
  format: OutputFormat
): void {
  const unsupported: Record<string, unknown> = {
    background:
      options.background === "transparent" ? undefined : options.background,
    enableGoogleSearch: options.enableGoogleSearch,
    enableSafetyChecker: options.enableSafetyChecker,
    enableWebSearch: options.enableWebSearch,
    enhancePrompt: options.enhancePrompt,
    expandPrompt: options.expandPrompt,
    guidanceScale: options.guidanceScale,
    imagePromptStrength: options.imagePromptStrength,
    imageSize: options.imageSize,
    limitGenerations: options.limitGenerations,
    negativePrompt: options.negativePrompt,
    numInferenceSteps: options.numInferenceSteps,
    outputFormat:
      options.outputFormat === "png" ? undefined : options.outputFormat,
    quality:
      options.quality === "xhigh" || options.quality === "max"
        ? options.quality
        : undefined,
    raw: options.raw,
    renderingSpeed: options.renderingSpeed,
    safetyTolerance: options.safetyTolerance,
    seed: options.seed,
    style: options.style,
    syncMode: options.syncMode,
    thinkingLevel: options.thinkingLevel,
  };
  const refused = Object.entries(unsupported)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (request.editPaths !== undefined && !route.supportsEdit) {
    refused.push("image editing");
  }
  if (request.mask !== undefined && request.editPaths === undefined) {
    refused.push("maskImageUrl");
  }
  if (refused.length > 0) {
    handleError(
      new Error(
        `${modelName} transparent output runs through ${route.provider} (${route.model}), which does not take: ${refused.join(", ")}. Drop them, or use -m gpt for transparency on fal.`
      ),
      "INVALID_OPTION",
      format
    );
  }
  if (request.mask !== undefined && !REMOTE_URL_REGEX.test(request.mask)) {
    try {
      validateEditPath(request.mask);
    } catch (error) {
      handleError(error, "INVALID_EDIT_PATH", format);
    }
  }
}

/** The request as a dry run shows it: endpoint plus body. */
export function routePreview(
  route: ProviderRoute,
  request: RouteRequest
): { body: Record<string, unknown>; endpoint: string } {
  return {
    body: {
      n: request.n,
      prompt: request.prompt,
      size: request.size,
      ...(request.editPaths !== undefined && { images: request.editPaths }),
      ...(request.mask !== undefined && { mask: request.mask }),
      ...openAiProviderOptions(request),
    },
    endpoint: `${route.provider}:${route.model}`,
  };
}

/** Extra dry-run fields naming the route, its model and the key it needs. */
export function routeDryRunFields(
  route: ProviderRoute,
  pricePerImage: number | undefined
): Record<string, unknown> {
  return {
    provider: route.provider,
    providerModel: route.model,
    requiredEnv: route.apiKeyEnv,
    ...(pricePerImage === undefined && {
      costNote: `${route.provider} bills ${route.model} by tokens; no per-image price is known, so cost is reported as unknown`,
    }),
  };
}

/** Exit with MISSING_API_KEY, naming the env var, when the route has no key. */
export function requireRouteKey(
  route: ProviderRoute,
  modelName: string,
  format: OutputFormat
): void {
  if (hasText(getOpenAiKeyFromEnv())) {
    return;
  }
  emitError(
    {
      code: "MISSING_API_KEY",
      details: { envVar: route.apiKeyEnv, route: route.provider },
      message: `${modelName} transparent output runs through ${route.provider} and needs ${route.apiKeyEnv}, which is not set.`,
      suggestions: [
        `export ${route.apiKeyEnv}=... (an ${route.provider} API key)`,
        "Or use -m gpt, which renders transparent PNGs on fal with FAL_KEY",
      ],
    },
    format
  );
  exitForErrorCode("MISSING_API_KEY");
}

/**
 * Run the request. Cost per image comes from the adapter's pricing, or is
 * null when the adapter doesn't know it.
 */
export async function runRoute(
  route: ProviderRoute,
  request: RouteRequest
): Promise<{ costPerImage: number | null; result: MotifImageResult }> {
  const result = await generateViaOpenAi({ ...request, route });
  const costPerImage =
    result.cost.source === "unknown" || result.images.length === 0
      ? null
      : result.cost.usd / result.images.length;
  return { costPerImage, result };
}
