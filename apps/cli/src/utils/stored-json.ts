import { readFile } from "node:fs/promises";

import { parseJsonAs } from "./json";

/**
 * A file Motif keeps (config, history, a series) that exists but cannot be
 * used. Motif never replaces such a file: a write over it would erase what the
 * user had in it.
 */
export class CorruptFileError extends Error {
  readonly path: string;

  constructor(path: string, problem: string) {
    super(
      `${path} is unusable: ${problem}. Motif leaves it untouched; fix or delete the file and run the command again`
    );
    this.name = "CorruptFileError";
    this.path = path;
  }
}

/**
 * A file Motif keeps that the operating system would not let it read or write
 * (permissions, a directory where the file should be, a full disk). The
 * file's content was never judged, and Motif changed nothing.
 */
export class StorageError extends Error {
  readonly errno: string;
  readonly operation: "read" | "write";
  readonly path: string;

  constructor(path: string, operation: "read" | "write", cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Cannot ${operation} ${path}: ${reason}`);
    this.name = "StorageError";
    this.errno = errnoCode(cause);
    this.operation = operation;
    this.path = path;
  }
}

/** The errno name of a failed file call (EACCES, EISDIR...), or "unknown". */
function errnoCode(error: unknown): string {
  return error instanceof Error && "code" in error
    ? String(error.code)
    : "unknown";
}

/** Returns what is wrong with a parsed value, or undefined when it is fine. */
export type ShapeCheck = (value: unknown) => string | undefined;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The problem with `value[key]` if it is present with the wrong type. */
export function optionalFieldProblem(
  value: Record<string, unknown>,
  key: string,
  type: "boolean" | "number" | "object" | "string"
): string | undefined {
  const field = value[key];
  if (field === undefined) {
    return undefined;
  }
  const ok = type === "object" ? isRecord(field) : typeof field === type;
  return ok
    ? undefined
    : `"${key}" must be a${type === "object" ? "n" : ""} ${type}`;
}

/** The problem with `value[key]` unless it is present with the right type. */
export function requiredFieldProblem(
  value: Record<string, unknown>,
  key: string,
  type: "number" | "string"
): string | undefined {
  return value[key] === undefined
    ? `"${key}" is missing`
    : optionalFieldProblem(value, key, type);
}

function isMissingFile(error: unknown): boolean {
  return errnoCode(error) === "ENOENT";
}

/**
 * Read and parse a JSON file. A missing file is `undefined`; a file that does
 * not parse or fails `check` throws `CorruptFileError`. Any other read failure
 * (permissions, a directory in its place) throws `StorageError`.
 */
export async function readJsonFile<T>(
  path: string,
  check: ShapeCheck
): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw new StorageError(path, "read", error);
  }

  let parsed: T;
  try {
    parsed = parseJsonAs<T>(raw);
  } catch (error) {
    throw new CorruptFileError(
      path,
      `not valid JSON (${error instanceof Error ? error.message : String(error)})`
    );
  }
  const problem = check(parsed);
  if (problem !== undefined) {
    throw new CorruptFileError(path, problem);
  }
  return parsed;
}
