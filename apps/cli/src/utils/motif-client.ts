/**
 * The CLI's one SDK client. Every Task the CLI runs goes through `createMotif`
 * from here, so keys, pins and the network seam are set in one place.
 *
 * Sources are turned into what the SDK takes: a remote URL passes through, a
 * local image becomes a data URL, and a local video is uploaded to fal storage
 * because a data URL of a video is too large to send.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import {
  createMotif,
  getFalKeyFromEnv,
  getOpenAiKeyFromEnv,
} from "@howells/motif-sdk";
import type {
  MotifClient,
  MotifError,
  Result,
  TaskId,
  TaskInput,
  TaskPlan,
} from "@howells/motif-sdk";

import type { MotifConfig } from "./config";
import { taskPins } from "./config";
import { imageToDataUrl } from "./image";
import { validateEditPath } from "./input";
import { hasText } from "./text";

export const REMOTE_URL_REGEX = /^https:\/\//i;

const VIDEO_TYPES: Readonly<Record<string, string>> = {
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/** Build the SDK client from this process's keys and the config's pins. */
export function motifClient(config: MotifConfig): MotifClient {
  const falKey = getFalKeyFromEnv() ?? config.apiKey;
  const openAiKey = getOpenAiKeyFromEnv();
  return createMotif({
    ...(hasText(falKey) ? { falKey } : {}),
    ...(hasText(openAiKey) ? { openAiKey } : {}),
    pins: taskPins(config),
  });
}

/** Whether a path names a video the SDK should receive as `video`. */
export function isVideoPath(path: string): boolean {
  return Object.hasOwn(VIDEO_TYPES, extname(path).toLowerCase());
}

/** An image for the SDK: a remote URL as given, a local file as a data URL. */
export async function imageSource(path: string): Promise<string> {
  if (REMOTE_URL_REGEX.test(path)) {
    return path;
  }
  return await imageToDataUrl(validateEditPath(path));
}

/**
 * A video for the SDK: a remote URL as given, a local file uploaded to fal
 * storage. Uploading spends nothing but needs a key, so a dry run passes the
 * local path through untouched instead.
 */
export async function videoSource(
  client: MotifClient,
  path: string,
  dryRun: boolean
): Promise<string> {
  if (REMOTE_URL_REGEX.test(path) || dryRun) {
    return path;
  }
  const localPath = resolve(path);
  if (!existsSync(localPath)) {
    throw new Error(`Video not found: ${path}`);
  }
  const contentType = VIDEO_TYPES[extname(localPath).toLowerCase()];
  if (contentType === undefined) {
    throw new Error(`Not a supported video file: ${path}`);
  }
  const bytes = new Uint8Array(await readFile(localPath));
  const uploaded = await client.upload(bytes, contentType);
  if (uploaded.isErr()) {
    throw uploaded.error;
  }
  return uploaded.value;
}

const IMAGE_FORMAT_BY_EXTENSION: Readonly<
  Record<string, "jpeg" | "png" | "webp">
> = {
  ".jpeg": "jpeg",
  ".jpg": "jpeg",
  ".png": "png",
  ".webp": "webp",
};

/**
 * Plan a Task, asking for the image format an output path's extension names
 * when the caller named none. The format is only kept when the Model the plain
 * request resolves to takes it: an output filename must never change which
 * Model runs. Returns the input to run alongside its plan.
 */
export function planForOutput(
  client: MotifClient,
  task: TaskId,
  input: TaskInput,
  outputPath: string | undefined,
  dryRun: boolean
): Result<{ input: TaskInput; plan: TaskPlan }, MotifError> {
  const base = client.plan(task, input, { dryRun });
  const format =
    outputPath === undefined
      ? undefined
      : IMAGE_FORMAT_BY_EXTENSION[extname(outputPath).toLowerCase()];
  if (
    base.isErr() ||
    format === undefined ||
    input.outputFormat !== undefined
  ) {
    return base.map((plan) => ({ input, plan }));
  }
  const withFormat = { ...input, outputFormat: format };
  const formatted = client.plan(task, withFormat, { dryRun });
  if (formatted.isOk() && formatted.value.model === base.value.model) {
    return formatted.map((plan) => ({ input: withFormat, plan }));
  }
  return base.map((plan) => ({ input, plan }));
}

const DATA_URL_PREFIX = "data:";

/** A request body with every data URL replaced by its size, for printing. */
export function redactDataUrls(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith(DATA_URL_PREFIX)
      ? `<data url, ${Buffer.byteLength(value)} bytes>`
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(redactDataUrls);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactDataUrls(item)])
    );
  }
  return value;
}
