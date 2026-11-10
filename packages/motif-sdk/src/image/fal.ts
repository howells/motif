/**
 * fal provider adapter.
 *
 * Builds a Vercel AI SDK `ImageModel` from `@ai-sdk/fal`. Building a model
 * performs no network I/O — the request only happens when `generateImage`
 * invokes `model.doGenerate`. This is the lightweight fal *image* adapter; the
 * Task client (`createMotif`) runs fal's queue, upload and tools.
 *
 * ENDPOINT QUIRK (Phase 0): fal's gpt-image endpoint wants `image_size` as a
 * STRING enum (e.g. "1024x1024"), passed at generate time via
 * `providerOptions.fal.image_size` — NOT the AI SDK's generic `size` object.
 * This adapter does NOT auto-inject it; callers pass `providerOptions` when they
 * need a specific size. Example:
 *   img.generate({
 *     provider: "fal",
 *     model: "fal-ai/gpt-image-1.5",
 *     prompt: "...",
 *     providerOptions: { fal: { image_size: "1024x1024" } },
 *   });
 */

import { createFal } from "@ai-sdk/fal";
import type { ImageModel } from "ai";

import { MotifError } from "../errors";
import { MODELS } from "../models";
import type { FalFetch } from "../types";
import { toProviderFetch } from "./fetch";
import type { ImageProviderAdapter } from "./provider";

/** The gpt-image endpoint id priced in {@link FAL_IMAGE_PRICE_USD} below. */
const FAL_GPT_IMAGE_MODEL = "fal-ai/gpt-image-1.5";

/** Env var read for the fal key when `apiKey` is not supplied in config. */
export const FAL_API_KEY_ENV = "FAL_KEY";

/**
 * Static fal USD/image, keyed by the fal ENDPOINT id. Cost tracking must price
 * the endpoints consumers actually pass. Every price is
 * sourced from the fal registry snapshot in `../models`
 * (`MODELS[...].pricePerImageUsd`) so this table stays in sync rather than
 * drifting to a second hand-maintained copy; the `??` fallbacks are the registry
 * values at time of writing, used only if a registry entry loses its optional
 * price. Each key is `MODELS[x].endpoint`; the trailing comment cites the
 * `MODELS` key it comes from. Covers the flux2 family, banana, seedream, and
 * the other priced fal generation endpoints.
 */
const FAL_IMAGE_PRICE_USD: Readonly<Record<string, number>> = {
  // FLUX.2 family.
  "fal-ai/flux-2-pro": MODELS["flux2-pro"]?.pricePerImageUsd ?? 0.03, // MODELS["flux2-pro"]
  "fal-ai/flux-2-flex": MODELS["flux2-flex"]?.pricePerImageUsd ?? 0.05, // MODELS["flux2-flex"]
  "fal-ai/flux-2/turbo": MODELS["flux2-turbo"]?.pricePerImageUsd ?? 0.008, // MODELS["flux2-turbo"]
  // gpt-image (fal adds overhead vs OpenAI-direct — see design doc §10).
  [FAL_GPT_IMAGE_MODEL]: MODELS.gpt?.pricePerImageUsd ?? 0.133, // MODELS.gpt
  // Nano Banana (Gemini image) family.
  "fal-ai/nano-banana-2": MODELS.banana2?.pricePerImageUsd ?? 0.08, // MODELS.banana2
  "fal-ai/nano-banana-pro": MODELS.banana?.pricePerImageUsd ?? 0.15, // MODELS.banana
  // Seedream family.
  "bytedance/seedream/v5/pro/text-to-image":
    MODELS.seedream5?.pricePerImageUsd ?? 0.0675, // MODELS.seedream5
  "bytedance/seedream/v5/lite/text-to-image":
    MODELS["seedream5-lite"]?.pricePerImageUsd ?? 0.035, // MODELS["seedream5-lite"]
  // Other priced fal generation endpoints.
  "fal-ai/recraft/v4.1/text-to-image":
    MODELS.recraft41?.pricePerImageUsd ?? 0.035, // MODELS.recraft41
  "ideogram/v4": MODELS.ideogram4?.pricePerImageUsd ?? 0.03, // MODELS.ideogram4
  "xai/grok-imagine-image": MODELS["grok-image"]?.pricePerImageUsd ?? 0.02, // MODELS["grok-image"]
  "xai/grok-imagine-image/v2.0/text-to-image":
    MODELS["grok-image-2"]?.pricePerImageUsd ?? 0.06, // MODELS["grok-image-2"]
  "xai/grok-imagine-image/quality/text-to-image":
    MODELS["grok-image-quality"]?.pricePerImageUsd ?? 0.05, // MODELS["grok-image-quality"]
  "meta/muse-image/text-to-image":
    MODELS["muse-image"]?.pricePerImageUsd ?? 0.01, // MODELS["muse-image"]
  "microsoft/mai-image-2.5-pro":
    MODELS["mai-image-2.5-pro"]?.pricePerImageUsd ?? 0.17, // MODELS["mai-image-2.5-pro"]
  "fal-ai/ideogram/v3/generate-transparent":
    MODELS["ideogram3-transparent"]?.pricePerImageUsd ?? 0.06, // MODELS["ideogram3-transparent"]
  "alibaba/qwen-image-3/text-to-image": MODELS.qwen3?.pricePerImageUsd ?? 0.04, // MODELS.qwen3
};

/**
 * Build a fal `ImageModel`. Prefers the passed `apiKey`, else the `FAL_KEY` env
 * var. Throws `MotifError` when neither is present (callers translate this into
 * a `Result.err`).
 */
export function resolveModel(
  modelId: string,
  apiKey?: string,
  fetch?: FalFetch
): ImageModel {
  const key = apiKey ?? process.env[FAL_API_KEY_ENV];
  if (key === undefined || key === "") {
    throw new MotifError(
      `fal image generation requires an API key (config.fal.apiKey or ${FAL_API_KEY_ENV})`,
      0
    );
  }
  return createFal({ apiKey: key, ...toProviderFetch(fetch) }).image(modelId);
}

/**
 * How a registered fal edit endpoint takes its input images, from the
 * registry's `editImagesField` (default `image_urls`). `@ai-sdk/fal` sends only
 * the first image as `image_url` unless told otherwise, which list-only
 * endpoints reject and which silently drops every reference after the first.
 * Undefined for an endpoint the registry does not list as an edit route.
 */
export function falEditImagesField(
  modelId: string
): "image_urls" | "image_url" | undefined {
  const config = Object.values(MODELS).find(
    (entry) => entry.editEndpoint === modelId
  );
  return config === undefined
    ? undefined
    : (config.editImagesField ?? "image_urls");
}

/** The fal provider adapter registered in the provider registry. */
export const falAdapter: ImageProviderAdapter = {
  id: "fal",
  apiKeyEnv: FAL_API_KEY_ENV,
  resolveModel,
  priceUsdByModel: FAL_IMAGE_PRICE_USD,
};
