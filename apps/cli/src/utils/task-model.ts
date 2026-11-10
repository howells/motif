/**
 * The CLI's routes to Task resolution and its errors: `resolveTask` with the
 * keys this process can see and the Models pinned in config, and the mapping
 * from a refused resolution or a Task client error onto exit codes.
 */

import {
  ACCOUNT_LOCKED,
  getFalKeyFromEnv,
  INVALID_RESPONSE,
  MotifError,
  NO_MODEL_AVAILABLE,
  refusedOption,
  REQUEST_NOT_FOUND,
  resolveTask,
  SUBMISSION_UNCERTAIN,
} from "@howells/motif-sdk";
import type {
  TaskId,
  TaskPlan,
  TaskRequest,
  TaskResolution,
} from "@howells/motif-sdk";

import type { MotifConfig } from "./config";
import { MISSING_FAL_KEY_MESSAGE, taskPins } from "./config";
import { exitForErrorCode, handleError, isStoredFileError } from "./errors";
import { emitError } from "./output";
import type { OutputFormat } from "./output";
import { isRequestId, removePendingRun } from "./pending-runs";
import type { PendingOutcome } from "./pending-runs";
import { hasText } from "./text";

export function resolveTaskModel(
  task: TaskId,
  request: TaskRequest,
  config: MotifConfig,
  opts: { dryRun: boolean }
): TaskResolution {
  const keys: string[] = [];
  // A dry run prices what would run, so it resolves as if the key were set.
  if (opts.dryRun || hasText(getFalKeyFromEnv()) || hasText(config.apiKey)) {
    keys.push("FAL_KEY");
  }
  return resolveTask(task, request, { keys, pins: taskPins(config) });
}

/** What a refused resolution carries, from `resolveTask` or an SDK error's details. */
export interface RefusedResolution {
  /** The values the Model takes, when it refused an aspect, resolution or format. */
  accepts?: readonly string[];
  blockedBy: string;
  /** The most images the Model makes, when it refused a count. */
  limit?: number;
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

/** Task flags a Model can refuse, keyed by the SDK capability they ask for. */
const FLAG_BLOCKERS: Readonly<Record<string, string>> = {
  markup: "--markup",
  markupImageUrl: "--markup",
  maskImageUrl: "--mask",
  rig: "--rig",
  "transparent output": "--transparent",
};

/**
 * The refusal in the flag's words, without the Model's name: the SDK says
 * "trellis-2 (model) cannot do rig.", the CLI says which flag to drop.
 */
function flagRefusal(
  resolution: RefusedResolution
): { message: string; suggestions: string[] } | undefined {
  const flag = FLAG_BLOCKERS[resolution.blockedBy];
  if (flag === undefined) {
    return undefined;
  }
  const task = resolution.task ?? "this Task";
  return resolution.message.startsWith("No Model")
    ? {
        message: `No Model for this ${task} mode can do ${flag}: drop the mode flag or ${flag}.`,
        suggestions: [`Drop ${flag}`, "Or drop the mode flag"],
      }
    : {
        message: `The Model named with -m can't do ${flag}: drop -m to use one that can, or drop ${flag}.`,
        suggestions: [
          `Drop -m to use a Model that can do ${flag}`,
          `Or drop ${flag}`,
        ],
      };
}

/**
 * Report a refused resolution and exit. A missing key is the same
 * MISSING_API_KEY (exit 3) every other command reports; a Model that is not
 * one for the Task is UNKNOWN_MODEL; anything else is NO_MODEL_AVAILABLE.
 */
function exitNoModelAvailable(
  resolution: RefusedResolution,
  format: OutputFormat
): never {
  if (resolution.blockedBy === "key") {
    exitMissingKey(resolution.missingKey ?? "FAL_KEY", format);
  }
  const refused = flagRefusal(resolution);
  const code =
    resolution.blockedBy === "unknown-model"
      ? "UNKNOWN_MODEL"
      : NO_MODEL_AVAILABLE;
  emitError(
    {
      code,
      details: {
        accepts: resolution.accepts,
        blockedBy: resolution.blockedBy,
        limit: resolution.limit,
        missingKey: resolution.missingKey,
        task: resolution.task,
        unblockedBy: resolution.unblockedBy,
      },
      message: refused?.message ?? resolution.message,
      ...(refused !== undefined && { suggestions: refused.suggestions }),
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
 * The owners fal hosts Motif's Models under. An endpoint id is one of these
 * followed by a path, as in `fal-ai/flux-2-pro` or `openai/gpt-image-2/edit`;
 * the registry test fails when a Model lives under an owner missing here.
 */
const ENDPOINT_OWNERS = [
  "alibaba",
  "bria",
  "bytedance",
  "clarityai",
  "fal-ai",
  "google",
  "ideogram",
  "krea",
  "meshy",
  "meta",
  "microsoft",
  "openai",
  "topaz",
  "xai",
];

/** An endpoint id not inside a URL or a longer path. */
const ENDPOINT_PATTERN = new RegExp(
  `(?<![\\w./:-])(?:${ENDPOINT_OWNERS.join("|")})(?:/[\\w.-]*[\\w-])+`,
  "g"
);

/**
 * An upstream message with each fal endpoint replaced by the Task name, so a
 * failure reads "Cannot access application generate" rather than naming the
 * Model behind it.
 */
export function withoutEndpoints(message: string, task: string): string {
  return message.replaceAll(ENDPOINT_PATTERN, task);
}

/** What a failure knows about the run it came from. */
export interface TaskContext {
  model?: string;
  /** Whether the run's pending record was written, so `motif resume` can read it. */
  pending?: PendingOutcome;
  task: string;
}

/** The recovery a failure after fal accepted a run offers, or says it cannot. */
interface ResumeAdvice {
  details?: Record<string, unknown>;
  suggestions?: string[];
}

/**
 * What to tell the caller about a failed run that has a request id. A job fal
 * reports failed, or has no record of, is over: its pending record goes and
 * nothing is offered. A run whose record was written offers `motif resume`.
 */
function resumeAdvice(
  error: MotifError,
  context: TaskContext
): ResumeAdvice | undefined {
  const { requestId } = error;
  if (requestId === undefined || !isRequestId(requestId)) {
    return undefined;
  }
  if (error.details?.jobFailed === true || error.code === REQUEST_NOT_FOUND) {
    removePendingRun(requestId);
    return undefined;
  }
  if (context.pending?.requestId === requestId) {
    return {
      suggestions: [
        `Run 'motif resume ${requestId}' to collect the same job; it is not billed twice`,
        "Do not run the original command again: that submits, and bills, a new run",
      ],
    };
  }
  return context.pending?.failure === undefined
    ? undefined
    : {
        details: { pendingRecord: `not written: ${context.pending.failure}` },
      };
}

/**
 * Emit TASK_FAILED and exit 5. The message names no endpoint; when one was
 * replaced, `details.message` keeps the upstream text.
 */
export function exitTaskFailed(
  message: string,
  context: TaskContext,
  format: OutputFormat,
  requestId?: string,
  advice?: ResumeAdvice
): never {
  const cleaned = withoutEndpoints(message, context.task);
  emitError(
    {
      code: "TASK_FAILED",
      details: {
        model: context.model,
        task: context.task,
        ...(cleaned === message ? {} : { message }),
        ...advice?.details,
      },
      ...(requestId === undefined
        ? {}
        : { instance: `urn:fal:request:${requestId}` }),
      message: cleaned,
      ...(advice?.suggestions === undefined
        ? {}
        : { suggestions: advice.suggestions }),
    },
    format
  );
  exitForErrorCode("TASK_FAILED");
}

/**
 * Report a failure after a run that fal already finished (saving or reporting
 * its files) and exit. A file Motif keeps that cannot be used keeps its own
 * code; anything else is TASK_FAILED.
 */
export function exitAfterRunFailed(
  error: unknown,
  context: TaskContext,
  format: OutputFormat
): never {
  if (isStoredFileError(error)) {
    handleError(error, "CORRUPT_FILE", format);
  }
  exitTaskFailed(
    error instanceof Error ? error.message : String(error),
    context,
    format
  );
}

/**
 * Report an error from the SDK Task client and exit. A refused resolution or
 * option exits 2, a missing key exits 3, and anything that failed upstream is
 * TASK_FAILED (exit 5) naming the Task and the Model it ran.
 */
export function exitTaskError(
  error: unknown,
  format: OutputFormat,
  context: TaskContext
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
    const { accepts, unblockedBy } = details;
    exitNoModelAvailable(
      {
        accepts: Array.isArray(accepts)
          ? accepts.filter((item): item is string => typeof item === "string")
          : undefined,
        blockedBy: refusedOption(error) ?? "unknown",
        limit: typeof details.limit === "number" ? details.limit : undefined,
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
  const advice = resumeAdvice(error, context);
  if (error.code === SUBMISSION_UNCERTAIN || error.code === INVALID_RESPONSE) {
    emitError(
      {
        code: error.code,
        details: {
          ...details,
          model: context.model,
          task: context.task,
          ...advice?.details,
        },
        ...(error.requestId === undefined
          ? {}
          : { instance: `urn:fal:request:${error.requestId}` }),
        message: withoutEndpoints(error.message, context.task),
        ...(advice?.suggestions === undefined
          ? {}
          : { suggestions: advice.suggestions }),
      },
      format
    );
    exitForErrorCode(error.code);
  }
  if (error.code === REQUEST_NOT_FOUND) {
    emitError(
      {
        code: REQUEST_NOT_FOUND,
        details: { ...details, model: context.model, task: context.task },
        instance: `urn:fal:request:${error.requestId}`,
        message: withoutEndpoints(error.message, context.task),
      },
      format
    );
    exitForErrorCode(REQUEST_NOT_FOUND);
  }
  exitTaskFailed(error.message, context, format, error.requestId, advice);
}

/**
 * The fields every run's JSON carries about the Task and its Model, from a
 * plan or an output.
 */
export function identityFields(
  plan: Pick<TaskPlan, "chosenBy" | "model" | "task" | "tier">
): Pick<TaskPlan, "chosenBy" | "model" | "task" | "tier"> {
  return {
    task: plan.task,
    model: plan.model,
    tier: plan.tier,
    chosenBy: plan.chosenBy,
  };
}

/** {@link identityFields}, then the mode when there is one, and the cost. */
export function taskFields(
  plan: Pick<TaskPlan, "chosenBy" | "cost" | "mode" | "model" | "task" | "tier">
): Record<string, unknown> {
  return {
    ...identityFields(plan),
    ...(plan.mode === undefined ? {} : { mode: plan.mode }),
    cost: plan.cost.usd,
    costBasis: plan.cost.basis,
  };
}
