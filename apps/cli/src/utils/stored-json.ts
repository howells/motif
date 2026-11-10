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
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Read and parse a JSON file. A missing file is `undefined`; a file that does
 * not parse or fails `check` throws `CorruptFileError`. Other read failures
 * (permissions) propagate as they are.
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
    throw error;
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
