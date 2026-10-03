/**
 * OpenRouter provider adapter.
 *
 * Gemini image models are reached through OpenRouter's Image API
 * (`POST /api/v1/images`), never through Google's own API. OpenRouter has no
 * `@ai-sdk/*` image provider, so this adapter implements the AI SDK's
 * `ImageModel` contract directly. Building a model performs no network I/O —
 * the request only happens when `generateImage` invokes `model.doGenerate`.
 *
 * The endpoint takes reference images (`input_references`) for edits and
 * reports the call's USD cost in `usage.cost`, which is surfaced on
 * `providerMetadata` so the cost layer prefers it over the static table. It has
 * no mask input, so a mask fails the call instead of being dropped.
 */

import type { ImageModel } from "ai";

import { MotifError } from "../server";
import type { FalFetch } from "../types";
import { toProviderFetch } from "./fetch";
import type { ProviderFetch } from "./fetch";
import type { ImageProviderAdapter } from "./provider";

/** Env var read for the OpenRouter API key when `apiKey` is not supplied in config. */
export const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY";

const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";

/** Key under which this adapter's metadata sits on `providerMetadata`. */
const METADATA_KEY = "openrouter";

/**
 * The Gemini image models Motif exposes, by their bare Google names, mapped to
 * the OpenRouter slug that serves them. All six are listed by
 * `GET https://openrouter.ai/api/v1/images/models`.
 */
export const OPENROUTER_GEMINI_IMAGE_MODELS: Readonly<Record<string, string>> =
  {
    "gemini-2.5-flash-image": "google/gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview": "google/gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview": "google/gemini-3-pro-image-preview",
    "gemini-3.1-flash-image": "google/gemini-3.1-flash-image",
    "gemini-3-pro-image": "google/gemini-3-pro-image",
    "gemini-3.1-flash-lite-image": "google/gemini-3.1-flash-lite-image",
  };

/**
 * Static USD/image estimate, keyed by the bare model name. Used only when a
 * response carries no `usage.cost`; OpenRouter normally reports the real figure.
 *
 *   - `gemini-2.5-flash-image`: 1290 output tokens at $30 / 1M ≈ $0.039.
 *   - `gemini-3-pro-image-preview`, `gemini-3-pro-image`: ≈ $0.134 at 1K/2K.
 *   - `gemini-3.1-flash-image-preview`: priced with the 2.5 flash-image line
 *     pending a distinct published rate.
 *   - `gemini-3.1-flash-image`: $0.067 at 1K.
 *   - `gemini-3.1-flash-lite-image`: ≈ $0.0336 at 1K.
 * Source: https://ai.google.dev/gemini-api/docs/pricing
 */
export const OPENROUTER_IMAGE_PRICE_USD: Readonly<Record<string, number>> = {
  "gemini-2.5-flash-image": 0.039,
  "gemini-3.1-flash-image-preview": 0.039,
  "gemini-3-pro-image-preview": 0.134,
  "gemini-3.1-flash-image": 0.067,
  "gemini-3-pro-image": 0.134,
  "gemini-3.1-flash-lite-image": 0.0336,
};

/**
 * Resolve a Motif model name to an OpenRouter slug. A bare Gemini name maps to
 * its `google/<id>` slug; a name already containing `/` is an OpenRouter slug
 * and passes through. Anything else is unknown and throws.
 */
export function openRouterModelSlug(modelId: string): string {
  if (modelId.includes("/")) {
    return modelId;
  }
  const slug = OPENROUTER_GEMINI_IMAGE_MODELS[modelId];
  if (slug === undefined) {
    throw new MotifError(
      `No OpenRouter image model for "${modelId}". Known: ${Object.keys(OPENROUTER_GEMINI_IMAGE_MODELS).join(", ")}; or pass an OpenRouter slug such as google/gemini-3.1-flash-image.`,
      0
    );
  }
  return slug;
}

/** The `ImageModel` shape `generateImage` drives. */
type ImageModelV4 = Extract<ImageModel, { specificationVersion: "v4" }>;
type CallOptions = Parameters<ImageModelV4["doGenerate"]>[0];
type CallResult = Awaited<ReturnType<ImageModelV4["doGenerate"]>>;
type InputFile = NonNullable<CallOptions["files"]>[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toDataUrl(mediaType: string, data: string | Uint8Array): string {
  const base64 =
    typeof data === "string" ? data : Buffer.from(data).toString("base64");
  return `data:${mediaType};base64,${base64}`;
}

/** One `input_references` entry for an input file: a URL as-is, bytes as a data URL. */
function toInputReference(file: InputFile): {
  type: "image_url";
  image_url: { url: string };
} {
  const url =
    file.type === "url" ? file.url : toDataUrl(file.mediaType, file.data);
  return { type: "image_url", image_url: { url } };
}

function buildBody(
  slug: string,
  options: CallOptions
): Record<string, unknown> {
  if (options.mask !== undefined) {
    throw new MotifError(
      "OpenRouter's Image API takes no mask; describe the region in the instruction instead.",
      0
    );
  }
  const passthrough = options.providerOptions[METADATA_KEY] ?? {};
  return {
    ...passthrough,
    model: slug,
    prompt: options.prompt,
    n: options.n,
    ...(options.aspectRatio === undefined
      ? {}
      : { aspect_ratio: options.aspectRatio }),
    ...(options.files === undefined || options.files.length === 0
      ? {}
      : { input_references: options.files.map(toInputReference) }),
  };
}

function errorMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && isRecord(body.error)) {
    const { message } = body.error;
    if (typeof message === "string" && message !== "") {
      return message;
    }
  }
  return fallback;
}

interface ParsedResponse {
  images: string[];
  cost: number | undefined;
}

function parseResponse(body: unknown): ParsedResponse {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new MotifError("OpenRouter image response had no data array", 502);
  }
  const images: string[] = [];
  for (const entry of body.data) {
    if (isRecord(entry) && typeof entry.b64_json === "string") {
      images.push(entry.b64_json);
    }
  }
  if (images.length === 0) {
    throw new MotifError("OpenRouter returned no images", 502);
  }
  const cost =
    isRecord(body.usage) && typeof body.usage.cost === "number"
      ? body.usage.cost
      : undefined;
  return { images, cost };
}

function buildModel(
  modelId: string,
  apiKey: string,
  doFetch: ProviderFetch
): ImageModel {
  const slug = openRouterModelSlug(modelId);
  return {
    specificationVersion: "v4",
    provider: METADATA_KEY,
    modelId: slug,
    // The Image API accepts up to 10 per call; Gemini endpoints may return fewer.
    maxImagesPerCall: 10,
    async doGenerate(options: CallOptions): Promise<CallResult> {
      const warnings: CallResult["warnings"] = [];
      if (options.seed !== undefined) {
        warnings.push({ type: "unsupported", feature: "seed" });
      }
      if (options.size !== undefined) {
        warnings.push({
          type: "unsupported",
          feature: "size",
          details: "Gemini on OpenRouter takes aspectRatio, not pixel sizes.",
        });
      }
      const timestamp = new Date();
      const response = await doFetch(OPENROUTER_IMAGES_URL, {
        method: "POST",
        headers: {
          ...options.headers,
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildBody(slug, options)),
        ...(options.abortSignal === undefined
          ? {}
          : { signal: options.abortSignal }),
      });
      const text = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
      if (!response.ok) {
        throw new MotifError(
          errorMessage(body, `OpenRouter ${response.status}: ${text}`),
          response.status
        );
      }
      const { images, cost } = parseResponse(body);
      return {
        images,
        warnings,
        providerMetadata: {
          [METADATA_KEY]: {
            images: images.map(() => ({})),
            ...(cost === undefined ? {} : { cost }),
          },
        },
        response: {
          timestamp,
          modelId: slug,
          headers: Object.fromEntries(response.headers.entries()),
        },
      };
    },
  };
}

/**
 * Build an OpenRouter `ImageModel`. Prefers the passed `apiKey`, else the
 * `OPENROUTER_API_KEY` env var. Throws `MotifError` when neither is present or
 * the model name is unknown (callers translate this into a `Result.err`).
 */
export function resolveModel(
  modelId: string,
  apiKey?: string,
  fetch?: FalFetch
): ImageModel {
  const key = apiKey ?? process.env[OPENROUTER_API_KEY_ENV];
  if (key === undefined || key === "") {
    throw new MotifError(
      `OpenRouter image generation requires an API key (config.openrouter.apiKey or ${OPENROUTER_API_KEY_ENV})`,
      0
    );
  }
  const configured = toProviderFetch(fetch);
  const doFetch: ProviderFetch =
    "fetch" in configured ? configured.fetch : globalThis.fetch;
  return buildModel(modelId, key, doFetch);
}

/** The OpenRouter provider adapter registered in the provider registry. */
export const openrouterAdapter: ImageProviderAdapter = {
  id: "openrouter",
  apiKeyEnv: OPENROUTER_API_KEY_ENV,
  resolveModel,
  priceUsdByModel: OPENROUTER_IMAGE_PRICE_USD,
};
