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
  /** Flags the usage line names after the positionals, e.g. `--like <image>`. */
  usageFlags?: string;
  /** Whether the first positional is the prompt, for the chosen mode. */
  promptFirst: (mode: string | undefined, options: VerbOptions) => boolean;
  sourceKind: "image" | "image-or-video";
  /**
   * Whether the Task runs from a prompt alone in this mode, so a missing
   * source isn't filled from the last generation.
   */
  sourceOptional?: (mode: string | undefined) => boolean;
  /** The flag naming the Task's one Reference image, e.g. `like`. */
  referenceFlag?: string;
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

/** The positionals, then any flags the usage names. */
export function usageTail(definition: VerbDefinition): string {
  return definition.usageFlags === undefined
    ? definition.usage
    : `${definition.usage} ${definition.usageFlags}`;
}

/** `motif <command> <usage> <flags>`, as errors and `--describe` quote it. */
export function usageLine(definition: VerbDefinition): string {
  return `motif ${definition.command} ${usageTail(definition)}`;
}

/** Whether the verb reads a prompt from a positional in some mode. */
function takesPositionalPrompt(definition: VerbDefinition): boolean {
  return (
    definition.promptFirst(undefined, {}) ||
    definition.modes.some((flag) => definition.promptFirst(flag.mode, {}))
  );
}

/** The usage token that holds the prompt, e.g. `[light]`. */
function promptToken(definition: VerbDefinition): string | undefined {
  if (!takesPositionalPrompt(definition)) {
    return undefined;
  }
  return definition.usage
    .split(" ")
    .find((token) => !SOURCE_TOKENS.has(token.replaceAll(BRACKETS_REGEX, "")));
}

const SOURCE_TOKENS = new Set(["image", "image-or-video"]);

/** The brackets around a usage placeholder: `[light]`, `<prompt>`. */
const BRACKETS_REGEX = /^[[<]|[\]>]$/g;

/**
 * How the prompt reaches the verb, for `--describe`: a positional such as
 * `"light"`, or the value of a mode flag such as `--objects`.
 */
export function promptSource(definition: VerbDefinition): string | undefined {
  const token = promptToken(definition);
  const flags = definition.modes
    .filter((flag) => flag.valueIsPrompt === true)
    .map((flag) => `--${flag.mode}`);
  const sources = [
    ...(token === undefined
      ? []
      : [`the "${token.replaceAll(BRACKETS_REGEX, "")}" positional`]),
    ...(flags.length > 0 ? [`the value of ${flags.join(" or ")}`] : []),
  ];
  return sources.length > 0 ? sources.join(", or ") : undefined;
}

/**
 * The usage as the task table prints it: the prompt placeholder quoted, as
 * it would be typed, e.g. `motif erase "what" [image]`.
 */
export function tableUsage(definition: VerbDefinition): string {
  const token = promptToken(definition);
  const tail = usageTail(definition)
    .split(" ")
    .map((word) =>
      word === token ? `"${word.replaceAll(BRACKETS_REGEX, "")}"` : word
    )
    .join(" ");
  return `motif ${definition.command} ${tail}`;
}
