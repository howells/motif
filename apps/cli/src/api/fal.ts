/**
 * Direct fal calls for terminal Studio, which still runs its own generate,
 * upscale and background removal. Commands run Tasks through the SDK client
 * in `utils/motif-client.ts` instead.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { FalClient, getFalKeyFromEnv } from "@howells/motif-sdk";
import type {
  GenerateOptions,
  MotifError,
  MotifResponse,
  RemoveBackgroundOptions,
  Result,
  UpscaleOptions,
} from "@howells/motif-sdk";

import { hasText } from "../utils/text";

export type { GenerateOptions, MotifResponse } from "@howells/motif-sdk";

/** CLI-specific generate options that accept local file paths */
export interface CliGenerateOptions extends Omit<
  GenerateOptions,
  "editImageUrls"
> {
  editImages?: string[];
}

const MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function getMimeType(filePath: string): string {
  return (
    MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  );
}

/** Unwrap a Result, re-throwing the MotifError on failure. */
function unwrap<T>(result: Result<T, MotifError>): T {
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

let _apiKey: string | null = null;
let _motif: FalClient | null = null;

export function setApiKey(key: string): void {
  _apiKey = key;
  process.env.FAL_KEY = key;
  _motif = null; // Reset so next call picks up new key
}

export function getApiKey(): string {
  if (hasText(_apiKey)) {
    return _apiKey;
  }

  const envKey = getFalKeyFromEnv();
  if (hasText(envKey)) {
    return envKey;
  }

  throw new Error(
    "FAL_KEY not found. Set FAL_KEY environment variable or configure in ~/.motif/config.json"
  );
}

function getMotif(): FalClient {
  _motif ??= new FalClient(getApiKey());
  return _motif;
}

/** Generate an image (CLI-specific: handles local file uploads for edit mode) */
export async function generate(
  options: CliGenerateOptions
): Promise<MotifResponse> {
  const { editImages, ...rest } = options;

  // Upload local files to fal CDN if needed
  let editImageUrls: string[] | undefined;
  if (editImages !== undefined && editImages.length > 0) {
    editImageUrls = await Promise.all(
      editImages.map(async (img) =>
        img.startsWith("http")
          ? await Promise.resolve(img)
          : await uploadFile(img)
      )
    );
  }

  return unwrap(await getMotif().generate({ ...rest, editImageUrls }));
}

/** Upscale an image */
export async function upscale(options: UpscaleOptions): Promise<MotifResponse> {
  return unwrap(await getMotif().upscale(options));
}

/** Remove background from an image */
export async function removeBackground(
  options: RemoveBackgroundOptions
): Promise<MotifResponse> {
  return unwrap(await getMotif().removeBackground(options));
}

/**
 * Upload a local file to fal.ai CDN storage and return the public URL.
 */
export async function uploadFile(filePath: string): Promise<string> {
  const contentType = getMimeType(filePath);
  const fileName = filePath.split("/").pop() ?? "upload.bin";
  const buffer = await readFile(filePath);

  return unwrap(
    await getMotif().uploadToFalCdn(buffer, { contentType, fileName })
  );
}
