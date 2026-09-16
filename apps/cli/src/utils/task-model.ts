/**
 * The CLI's routes to Task resolution and its errors: `resolveTask` with the
 * keys this process can see and the Models pinned in config, and the mapping
 * from a refused resolution or a Task client error onto exit codes.
 */

import {
  ACCOUNT_LOCKED,
  FAL_TOOLS,
  getFalKeyFromEnv,
  getOpenAiKeyFromEnv,
  MODELS,
  MotifError,
  NO_MODEL_AVAILABLE,
  resolveTask,
} from "@howells/motif-sdk";
import type { TaskId, TaskRequest, TaskResolution } from "@howells/motif-sdk";

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

/** What a refused resolution carries, from `resolveTask` or an SDK error's details. */
export interface RefusedResolution {
  blockedBy: string;
  message: string;
  missingKey?: string;
  task?: string;
  unblockedBy?: readonly string[];
}

function exitMissingKey(key: string, format: OutputFormat): never {
  const message =
    key === "FAL_KEY"
      ? MISSING_FAL_KEY_MESSAGE
      : `${key} not found. Set the ${key} environment variable.`;
  emitError(
    {
      code: "MISSING_API_KEY",
      details: { envVar: key },
      message,
      suggestions: [`export ${key}=...`],
    },
    format
  );
  exitForErrorCode("MISSING_API_KEY");
}

/**
 * Report a refused resolution and exit. A missing key is the same
 * MISSING_API_KEY (exit 3) every other command reports; a Model that is not
 * one for the Task is UNKNOWN_MODEL; anything else is NO_MODEL_AVAILABLE.
 */
export function exitNoModelAvailable(
  resolution: RefusedResolution,
  format: OutputFormat
): never {
  if (resolution.blockedBy === "key") {
    exitMissingKey(resolution.missingKey ?? "FAL_KEY", format);
  }
  const code =
    resolution.blockedBy === "unknown-model"
      ? "UNKNOWN_MODEL"
      : NO_MODEL_AVAILABLE;
  emitError(
    {
      code,
      details: {
        blockedBy: resolution.blockedBy,
        missingKey: resolution.missingKey,
        task: resolution.task,
        unblockedBy: resolution.unblockedBy,
      },
      message: resolution.message,
    },
    format
  );
  exitForErrorCode(code);
}

function stringField(
  details: Record<string, unknown>,
  key: string
): string | undefined {
  const value = details[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Report an error from the SDK Task client and exit. A refused resolution or
 * option exits 2, a missing key exits 3, and anything that failed upstream is
 * TASK_FAILED (exit 5) naming the Task and the Model it ran.
 */
/** Every endpoint string a Model or tool names, longest first. */
function collectEndpoints(value: unknown, into: Set<string>): void {
  if (typeof value === "string") {
    if (value.includes("/") && !value.includes("://") && !value.includes(" ")) {
      into.add(value);
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const entry of Object.values(value)) {
      collectEndpoints(entry, into);
    }
  }
}

let endpointList: readonly string[] | undefined;

function endpoints(): readonly string[] {
  if (endpointList === undefined) {
    const found = new Set<string>();
    collectEndpoints(MODELS, found);
    collectEndpoints(FAL_TOOLS, found);
    endpointList = [...found].toSorted((a, b) => b.length - a.length);
  }
  return endpointList;
}

/**
 * An upstream message with each fal endpoint replaced by the Task name, so a
 * failure reads "Cannot access application generate" rather than naming the
 * Model behind it.
 */
export function withoutEndpoints(message: string, task: string): string {
  let result = message;
  for (const endpoint of endpoints()) {
    if (result.includes(endpoint)) {
      result = result.replaceAll(endpoint, task);
    }
  }
  return result;
}

/**
 * Emit TASK_FAILED and exit 5. The message names no endpoint; when one was
 * replaced, `details.message` keeps the upstream text.
 */
export function exitTaskFailed(
  message: string,
  context: { model?: string; task: string },
  format: OutputFormat,
  requestId?: string
): never {
  const cleaned = withoutEndpoints(message, context.task);
  emitError(
    {
      code: "TASK_FAILED",
      details: {
        model: context.model,
        task: context.task,
        ...(cleaned === message ? {} : { message }),
      },
      ...(requestId === undefined
        ? {}
        : { instance: `urn:fal:request:${requestId}` }),
      message: cleaned,
    },
    format
  );
  exitForErrorCode("TASK_FAILED");
}

export function exitTaskError(
  error: unknown,
  format: OutputFormat,
  context: { model?: string; task: string }
): never {
  if (!(error instanceof MotifError)) {
    exitTaskFailed(
      error instanceof Error ? error.message : String(error),
      context,
      format
    );
  }
  const details = error.details ?? {};
  if (error.code === NO_MODEL_AVAILABLE) {
    const { unblockedBy } = details;
    exitNoModelAvailable(
      {
        blockedBy: stringField(details, "blockedBy") ?? "unknown",
        message: error.message,
        missingKey: stringField(details, "missingKey"),
        task: stringField(details, "task") ?? context.task,
        unblockedBy: Array.isArray(unblockedBy)
          ? unblockedBy.filter(
              (item): item is string => typeof item === "string"
            )
          : undefined,
      },
      format
    );
  }
  if (error.code === "MISSING_API_KEY") {
    exitMissingKey(stringField(details, "envVar") ?? "FAL_KEY", format);
  }
  if (error.code === "INVALID_OPTION") {
    emitError(
      { code: "INVALID_OPTION", details, message: error.message },
      format
    );
    exitForErrorCode("INVALID_OPTION");
  }
  if (error.code === ACCOUNT_LOCKED) {
    handleError(error, ACCOUNT_LOCKED, format);
  }
  exitTaskFailed(error.message, context, format, error.requestId);
}

/**
 * The upscaler Studio runs: the upscale pin when it is one of the two it
 * supports, else Clarity.
 */
export function legacyUpscaler(config: MotifConfig): "clarity" | "crystal" {
  return taskPins(config).upscale === "crystal" ? "crystal" : "clarity";
}

/**
 * The background remover Studio runs: Bria when the cutout pin is Bria's,
 * else RMBG.
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
