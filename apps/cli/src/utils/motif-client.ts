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
  err,
  getFalKeyFromEnv,
  INVALID_OPTION,
  MotifError,
} from "@howells/motif-sdk";
import type {
  MotifClient,
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

/** Build the SDK client from this process's fal key and the config's pins. */
export function motifClient(config: MotifConfig): MotifClient {
  const falKey = getFalKeyFromEnv() ?? config.apiKey;
  return createMotif({
    ...(hasText(falKey) ? { falKey } : {}),
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

/** Several images for the SDK, as {@link imageSource} takes each. */
export async function imageSources(
  paths: readonly string[]
): Promise<string[]> {
  return await Promise.all(paths.map(async (path) => await imageSource(path)));
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
  Record<string, "gif" | "jpeg" | "png" | "svg" | "webp">
> = {
  ".gif": "gif",
  ".jpeg": "jpeg",
  ".jpg": "jpeg",
  ".png": "png",
  ".svg": "svg",
  ".webp": "webp",
};

/** Extensions that name a format other than the PNG every Model returns by default. */
const NON_DEFAULT_FORMATS: ReadonlySet<string> = new Set(["jpeg", "webp"]);

/**
 * Plan a Task, asking for the image format an output path's extension names
 * when the caller named none. An output filename must never change which Model
 * runs, so the format is only kept when the Model the plain request resolves
 * to takes it. A `.jpg` or `.webp` that Model cannot be asked for is refused,
 * because the file would otherwise be saved in whatever format it returns,
 * under a different extension. Returns the input to run alongside its plan.
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
    input.outputFormat !== undefined ||
    input.params?.output_format !== undefined
  ) {
    return base.map((plan) => ({ input, plan }));
  }
  const withFormat = { ...input, outputFormat: format };
  const formatted = client.plan(task, withFormat, { dryRun });
  if (formatted.isOk() && formatted.value.model === base.value.model) {
    return formatted.map((plan) => ({ input: withFormat, plan }));
  }
  if (NON_DEFAULT_FORMATS.has(format)) {
    return err(
      new MotifError(
        `${base.value.model} takes no output format, so ${outputPath} would be saved in whatever format it returns, under a different extension. Name the file .png and convert afterwards, or pick a Model that makes ${format}.`,
        0,
        INVALID_OPTION,
        undefined,
        { field: "output", format, model: base.value.model, task }
      )
    );
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
