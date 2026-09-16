/**
 * The CLI's one route to `resolveTask`: builds the environment from the keys
 * this process can see and the Models pinned in config.
 */

import {
  getFalKeyFromEnv,
  getOpenAiKeyFromEnv,
  NO_MODEL_AVAILABLE,
  resolveTask,
} from "@howells/motif-sdk";
import type {
  TaskId,
  TaskRequest,
  TaskResolution,
  TaskUnresolved,
} from "@howells/motif-sdk";

import type { CliOptions, StdinPayload } from "./cli-types";
import type { MotifConfig } from "./config";
import { MISSING_FAL_KEY_MESSAGE, taskPins } from "./config";
import { exitForErrorCode, handleError } from "./errors";
import { emitError } from "./output";
import type { OutputFormat } from "./output";
import { hasText } from "./text";

export function resolveTaskModel(
  task: TaskId,
  request: TaskRequest,
  config: MotifConfig,
  opts: { dryRun: boolean }
): TaskResolution {
  const keys: string[] = [];
  // A dry run prices what would run, so it resolves as if every key were set.
  if (opts.dryRun || hasText(getFalKeyFromEnv()) || hasText(config.apiKey)) {
    keys.push("FAL_KEY");
  }
  if (opts.dryRun || hasText(getOpenAiKeyFromEnv())) {
    keys.push("OPENAI_API_KEY");
  }
  return resolveTask(task, request, { keys, pins: taskPins(config) });
}

/**
 * Report a refused resolution and exit. A missing key is the same
 * MISSING_API_KEY (exit 3) every other command reports; anything else is
 * NO_MODEL_AVAILABLE.
 */
export function exitNoModelAvailable(
  resolution: TaskUnresolved,
  format: OutputFormat
): never {
  if (resolution.blockedBy === "key") {
    const key = resolution.missingKey ?? "FAL_KEY";
    const message =
      key === "FAL_KEY"
        ? MISSING_FAL_KEY_MESSAGE
        : `${key} not found. Set the ${key} environment variable.`;
    handleError(new Error(message), "MISSING_API_KEY", format);
  }
  emitError(
    {
      code: NO_MODEL_AVAILABLE,
      details: {
        blockedBy: resolution.blockedBy,
        missingKey: resolution.missingKey,
        unblockedBy: resolution.unblockedBy,
      },
      message: resolution.message,
    },
    format
  );
  exitForErrorCode(NO_MODEL_AVAILABLE);
}

/** The generate Model when the caller named none: a pin, else the ranking. */
export function defaultGenerateModel(
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: MotifConfig,
  format: OutputFormat
): string {
  const references = (options.edit ?? stdinData?.editImages ?? []).length;
  const count = Number(stdinData?.numImages ?? options.num ?? 1);
  const resolution = resolveTaskModel(
    "generate",
    {
      count: Number.isInteger(count) ? count : undefined,
      mask: hasText(options.mask) || hasText(stdinData?.maskImageUrl),
      references,
      transparent: (options.transparent ?? stdinData?.transparent) === true,
    },
    config,
    { dryRun: options.dryRun === true }
  );
  if (resolution.ok) {
    return resolution.model;
  }
  exitNoModelAvailable(resolution, format);
}

/**
 * The upscaler `--up` and Studio run: the upscale pin when it is one of the two
 * they support, else Clarity. Goes when MOT-53 retires `--up`.
 */
export function legacyUpscaler(config: MotifConfig): "clarity" | "crystal" {
  return taskPins(config).upscale === "crystal" ? "crystal" : "clarity";
}

/**
 * The background remover `--rmbg` and Studio run: Bria when the cutout pin is
 * Bria's, else RMBG. Goes when MOT-53 retires `--rmbg`.
 */
export function legacyBackgroundRemover(config: MotifConfig): "bria" | "rmbg" {
  return taskPins(config).cutout === "bria-rmbg" ? "bria" : "rmbg";
}

/**
 * The Model Studio starts a generation on: the generate pin, else the ranking.
 * Studio opens without a key so one can be set in Settings; then the ranking
 * is read as if every key were set, which is what runs once they are. A pin
 * the generate Task cannot use gives way to the ranking rather than failing.
 */
export function studioGenerateModel(config: MotifConfig): string {
  const { generate: _pin, ...otherPins } = config.tasks ?? {};
  const unpinned: MotifConfig = { ...config, tasks: otherPins };
  for (const candidate of [config, unpinned]) {
    for (const dryRun of [false, true]) {
      const resolution = resolveTaskModel("generate", {}, candidate, {
        dryRun,
      });
      if (resolution.ok) {
        return resolution.model;
      }
    }
  }
  throw new Error("No generate Model is available.");
}
