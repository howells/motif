/**
 * Direct OpenAI route for models whose transparent output fal cannot produce.
 *
 * fal's GPT Image 2 endpoint has no background option, so a transparent PNG
 * from gpt2 goes through the SDK image layer's OpenAI adapter instead. The
 * route itself (provider, model id, key) is registry metadata in the SDK.
 */

import { readFile } from "node:fs/promises";

import type { ProviderRoute } from "@howells/motif-sdk";
import { createMotifImage } from "@howells/motif-sdk/image";
import type { MotifImageResult } from "@howells/motif-sdk/image";

export interface OpenAiImageRequest {
  /** Local reference images; present for an edit. */
  editPaths?: string[];
  /** `"low"` keeps the edit loose (`--loose`). */
  inputFidelity?: "high" | "low";
  /** Local mask path or remote URL, applied to the first reference image. */
  mask?: string;
  n: number;
  prompt: string;
  quality?: string;
  route: ProviderRoute;
  /** Pixel size such as `"1536x1024"`, or `"auto"` to let OpenAI choose. */
  size: string;
}

/** Provider options sent for every transparent OpenAI request. */
export function openAiProviderOptions(
  request: Pick<OpenAiImageRequest, "editPaths" | "inputFidelity" | "quality">
): Record<string, unknown> {
  return {
    background: "transparent",
    outputFormat: "png",
    ...(request.quality !== undefined && { quality: request.quality }),
    ...(request.editPaths !== undefined &&
      request.inputFidelity !== undefined && {
        inputFidelity: request.inputFidelity,
      }),
  };
}

function isPixelSize(size: string): size is `${number}x${number}` {
  return /^\d+x\d+$/.test(size);
}

async function readMask(mask: string): Promise<Uint8Array | string> {
  return /^https?:\/\//i.test(mask) ? mask : await readFile(mask);
}

/** Generate or edit through OpenAI. Throws the SDK's `MotifError` on failure. */
export async function generateViaOpenAi(
  request: OpenAiImageRequest
): Promise<MotifImageResult> {
  const client = createMotifImage({ defaultProvider: request.route.provider });
  const providerOptions = { openai: openAiProviderOptions(request) };
  const common = {
    model: request.route.model,
    n: request.n,
    provider: request.route.provider,
    providerOptions,
  };

  const result =
    request.editPaths === undefined
      ? await client.generate({
          ...common,
          prompt: request.prompt,
          ...(isPixelSize(request.size) && { size: request.size }),
        })
      : await client.edit({
          ...common,
          images: await Promise.all(
            request.editPaths.map(async (path) => await readFile(path))
          ),
          instruction: request.prompt,
          ...(request.mask !== undefined && {
            mask: await readMask(request.mask),
          }),
        });

  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}
