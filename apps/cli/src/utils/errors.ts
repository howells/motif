import { ACCOUNT_LOCKED, MotifError } from "@howells/motif-sdk";
import type { Command } from "commander";

import { getErrorMetadata } from "./error-catalog";
import { validateOutputPath } from "./input";
import { emitError, resolveFormat } from "./output";
import type { OutputFormat } from "./output";

/** Build the RFC 7807 `instance` URN from a fal request id, if the error carries one. */
function instanceForError(err: unknown): string | undefined {
  if (err instanceof MotifError && err.requestId !== undefined) {
    return `urn:fal:request:${err.requestId}`;
  }
  return undefined;
}

/** Map a catalog HTTP-style status to a semantic process exit code. */
export function exitCodeForStatus(status: number): number {
  if (status === 401 || status === 403) {
    return 3; // authentication / authorization
  }
  if (status === 404) {
    return 4; // resource not found
  }
  if (status >= 400 && status < 500) {
    return 2; // invalid input / usage
  }
  if (status >= 500) {
    return 5; // upstream (fal) failure
  }
  return 1; // unknown
}

/**
 * Exit the process with the semantic code for a known error code's catalog
 * status. Use after emitting a structured error so exit codes stay aligned
 * with the RFC 7807 `status` field agents already receive.
 */
export function exitForErrorCode(code: string): never {
  process.exit(exitCodeForStatus(getErrorMetadata(code).status));
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  return "Unknown error";
}

function hasProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<K, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function getStructuredDetails(err: unknown): unknown {
  if (
    hasProperty(err, "code") &&
    err.code === "INVALID_OPTION" &&
    hasProperty(err, "option") &&
    typeof err.option === "string" &&
    hasProperty(err, "model") &&
    typeof err.model === "string" &&
    hasProperty(err, "supportedOptions") &&
    isStringArray(err.supportedOptions) &&
    hasProperty(err, "modelsSupporting") &&
    isStringArray(err.modelsSupporting)
  ) {
    return {
      model: err.model,
      modelsSupporting: err.modelsSupporting,
      option: err.option,
      supportedOptions: err.supportedOptions,
    };
  }
  if (
    hasProperty(err, "code") &&
    err.code === "INVALID_OPTION" &&
    hasProperty(err, "field") &&
    typeof err.field === "string" &&
    hasProperty(err, "value") &&
    typeof err.value === "string" &&
    hasProperty(err, "availableIds") &&
    isStringArray(err.availableIds)
  ) {
    return {
      availableIds: err.availableIds,
      field: err.field,
      value: err.value,
    };
  }

  return undefined;
}

export function validateOption<T>(format: OutputFormat, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    handleError(error, "INVALID_OPTION", format);
  }
}

export function validateOutput(
  format: OutputFormat,
  outputPath: string
): string {
  try {
    return validateOutputPath(outputPath);
  } catch (error) {
    handleError(error, "INVALID_OUTPUT_PATH", format);
  }
}

/**
 * Error codes the SDK assigns that outrank a command's own failure code,
 * because they name the real cause (a locked account is not a failed render).
 */
function sdkErrorCode(err: unknown): string | undefined {
  return err instanceof MotifError && err.code === ACCOUNT_LOCKED
    ? ACCOUNT_LOCKED
    : undefined;
}

export function handleError(
  err: unknown,
  fallbackCode: string,
  format: OutputFormat
): never {
  const code = sdkErrorCode(err) ?? fallbackCode;
  const metadata = getErrorMetadata(code);
  emitError(
    {
      code,
      details: getStructuredDetails(err),
      doc_uri: metadata.docUri,
      instance: instanceForError(err),
      is_retriable: metadata.isRetriable,
      message: getErrorMessage(err),
      status: metadata.status,
      suggestions: metadata.suggestions,
      title: metadata.title,
      type: metadata.type,
    },
    format
  );
  process.exit(exitCodeForStatus(metadata.status));
}

/**
 * Commander raises `--help` and `--version` through the same channel as parse
 * failures. These are the codes that mean "printed and done", not "failed".
 */
const COMMANDER_SUCCESS_CODES = new Set([
  "commander.help",
  "commander.helpDisplayed",
  "commander.version",
]);

/**
 * Resolve `--format` straight from argv, before commander parses it.
 *
 * A parse failure never reaches the parsed options, so the envelope's shape
 * has to be decided from the raw arguments.
 */
export function formatForParseErrors(args: string[]): OutputFormat {
  const inline = args.find((arg) => arg.startsWith("--format="));
  if (inline !== undefined) {
    return resolveFormat(inline.slice("--format=".length));
  }
  const index = args.indexOf("--format");
  return resolveFormat(index === -1 ? undefined : args[index + 1]);
}

/**
 * Swallow commander's own plain-English error line.
 *
 * The RFC 7807 envelope carries the same message, and a second bare line on
 * stderr breaks a caller parsing that stream as JSON. Commander prints nothing
 * when this hook declines to call `write`.
 */
function discardCommanderErrorLine(message: string): void {
  void message;
}

/**
 * Route commander's own parse failures through the CLI error envelope.
 *
 * Commander defaults to a bare English line on stderr and exit `1`, which
 * breaks both halves of the agent contract: invalid input must exit `2`, and
 * every failure must be an RFC 7807 object. Commander's diagnosis ("missing
 * required argument 'prompt'") is the useful part, so it becomes the
 * envelope's `message`.
 *
 * Call this before registering subcommands — commander copies the exit
 * callback and output configuration into each subcommand as it is created.
 */
export function routeCommanderErrors(
  program: Command,
  format: OutputFormat
): Command {
  return program
    .configureOutput({ outputError: discardCommanderErrorLine })
    .exitOverride((err) => {
      if (COMMANDER_SUCCESS_CODES.has(err.code)) {
        process.exit(err.exitCode);
      }
      handleError(
        new Error(err.message.replace(/^error: /, "")),
        "INVALID_OPTION",
        format
      );
    });
}
