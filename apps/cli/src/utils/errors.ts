import {
  ACCOUNT_LOCKED,
  CreativeOptionError,
  MotifError,
} from "@howells/motif-sdk";
import type { Command, CommanderError } from "commander";

import { getErrorMetadata } from "./error-catalog";
import type { KnownErrorCode } from "./error-catalog";
import { validateOutputPath } from "./input";
import { emitError, resolveFormat } from "./output";
import type { OutputFormat } from "./output";
import { CorruptFileError, StorageError } from "./stored-json";

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
export function exitForErrorCode(code: KnownErrorCode): never {
  process.exit(exitCodeForStatus(getErrorMetadata(code).status));
}

/** Report that there is no earlier generation to work from, and exit. */
export function exitNoPrevious(message: string, format: OutputFormat): never {
  emitError({ code: "NO_PREVIOUS", message }, format);
  exitForErrorCode("NO_PREVIOUS");
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

/** The details an error carries that the envelope should repeat. */
function getStructuredDetails(err: unknown): unknown {
  if (err instanceof CorruptFileError) {
    return { path: err.path };
  }
  if (err instanceof StorageError) {
    return { cause: err.errno, operation: err.operation, path: err.path };
  }
  if (err instanceof CreativeOptionError) {
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
 * The code an error names for itself, when that outranks the failure code of
 * the command that caught it: a locked account is not a failed render, and an
 * unusable config file is not a missing series. These are the only errors that
 * arrive carrying a code of their own; every other failure takes the catching
 * command's code, so no code reaches the envelope that the catalog lacks.
 */
function causeErrorCode(err: unknown): KnownErrorCode | undefined {
  if (err instanceof CorruptFileError) {
    return "CORRUPT_FILE";
  }
  if (err instanceof StorageError) {
    return "FILE_ACCESS_FAILED";
  }
  return err instanceof MotifError && err.code === ACCOUNT_LOCKED
    ? ACCOUNT_LOCKED
    : undefined;
}

export function handleError(
  err: unknown,
  fallbackCode: KnownErrorCode,
  format: OutputFormat
): never {
  const code = causeErrorCode(err) ?? fallbackCode;
  emitError(
    {
      code,
      details: getStructuredDetails(err),
      instance: instanceForError(err),
      message: getErrorMessage(err),
    },
    format
  );
  exitForErrorCode(code);
}

/** Whether `err` is a failure of a file Motif keeps, which has its own code. */
export function isStoredFileError(
  err: unknown
): err is CorruptFileError | StorageError {
  return err instanceof CorruptFileError || err instanceof StorageError;
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
 *
 * `refine` sees each failure first, so a caller can emit a more specific error
 * and exit; when it returns, the generic envelope goes out.
 */
/**
 * Refuse an option whose value is another flag. Commander hands the next
 * argument to a value option whatever it is, so `ask --detect --dry-run`
 * would read `--dry-run` as the thing to detect and make a paid call.
 */
export function refuseFlagValues(command: Command, format: OutputFormat): void {
  for (const option of command.options) {
    if (!(option.required || option.optional)) {
      continue;
    }
    const value: unknown = command.getOptionValue(option.attributeName());
    const values = Array.isArray(value) ? value : [value];
    const flag = values.find(
      (entry): entry is string =>
        typeof entry === "string" && entry.startsWith("--")
    );
    if (flag !== undefined) {
      handleError(
        new Error(`${option.long ?? option.flags} needs a value; got ${flag}`),
        "INVALID_OPTION",
        format
      );
    }
  }
}

export function routeCommanderErrors(
  program: Command,
  format: OutputFormat,
  refine?: (err: CommanderError) => void
): Command {
  return program
    .hook("preAction", (_program, actionCommand) => {
      refuseFlagValues(actionCommand, format);
    })
    .configureOutput({ outputError: discardCommanderErrorLine })
    .exitOverride((err) => {
      if (COMMANDER_SUCCESS_CODES.has(err.code)) {
        process.exit(err.exitCode);
      }
      refine?.(err);
      handleError(
        new Error(err.message.replace(/^error: /, "")),
        "INVALID_OPTION",
        format
      );
    });
}
