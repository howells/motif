/**
 * The shape of a Task verb definition, and the option helpers definitions
 * share.
 */

import type { TaskId, TaskInput, TaskOutput } from "@howells/motif-sdk";
import type { Command } from "commander";

import { handleError } from "../../utils/errors";
import type { OutputFormat } from "../../utils/output";
import type { VerbOptions } from "./shared";

/** A mode flag: `--text`, or a value flag such as `--detect <thing>`. */
export interface ModeFlag {
  /** The Task mode id, also the flag name. */
  mode: string;
  description: string;
  /** Placeholder for a value flag, e.g. `thing`. */
  value?: string;
  /** Whether a value flag's value is the prompt. */
  valueIsPrompt?: boolean;
}

export interface VerbDefinition {
  command: string;
  task: TaskId;
  /** Positional placeholders after the verb, as `--help` prints them. */
  usage: string;
  /** Whether the first positional is the prompt, for the chosen mode. */
  promptFirst: (mode: string | undefined, options: VerbOptions) => boolean;
  sourceKind: "image" | "image-or-video";
  /**
   * Whether the Task runs from a prompt alone in this mode, so a missing
   * source isn't filled from the last generation.
   */
  sourceOptional?: (mode: string | undefined) => boolean;
  /** A value flag that stands in for the prompt, e.g. relight's `--mood`. */
  promptFlag?: { key: string; usage: string };
  modes: readonly ModeFlag[];
  /** Present participle for the spinner. */
  verb: string;
  extension?: string;
  writesFiles?: (mode?: string) => boolean;
  quiet?: boolean;
  /** Extra flags beyond the common set and the modes. */
  options?: (command: Command) => Command;
  /** TaskInput fields the extra flags set. */
  input?: (
    options: VerbOptions,
    format: OutputFormat,
    mode: string | undefined
  ) => Promise<TaskInput> | TaskInput;
  data?: (output: TaskOutput) => Record<string, unknown>;
  render?: (output: TaskOutput) => string | undefined;
}

export const never = (): boolean => false;
export const always = (): boolean => true;

export function stringOption(
  options: VerbOptions,
  key: string
): string | undefined {
  const value = options[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function invalid(message: string, format: OutputFormat): never {
  handleError(new Error(message), "INVALID_OPTION", format);
}

export function parsed<T>(format: OutputFormat, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    handleError(error, "INVALID_OPTION", format);
  }
}
