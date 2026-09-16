/**
 * Plumbing every Task verb shares: the flags each one carries, the flag bag
 * commander fills in, and turning the common flags into TaskInput fields.
 */

import { TIERS } from "@howells/motif-sdk";
import type { TaskInput, Tier } from "@howells/motif-sdk";
import type { Command } from "commander";

import { handleError } from "../../utils/errors";
import { parseIntegerOption, validateEnumOption } from "../../utils/input";
import { resolveFormat } from "../../utils/output";
import type { EmitOptions, OutputFormat } from "../../utils/output";
import { hasText } from "../../utils/text";

/**
 * Every flag a verb can carry, in one bag. Commander hands each action one
 * options object and each verb registers only its own flags, so a flag can
 * never reach a verb that did not declare it.
 */
export type VerbOptions = Record<string, unknown> & {
  dryRun?: boolean;
  fields?: string;
  format?: string;
  model?: string;
  /** Commander's `--no-open` negation: false when the caller passed it. */
  open?: boolean;
  output?: string;
  param?: string[];
  seed?: string;
  tier?: string;
};

/** Commander collector: each `--param key=value` adds one. */
function collectParam(value: string, previous?: string[]): string[] {
  return [...(previous ?? []), value];
}

/** Flags every verb carries, so an agent learns one shape and reuses it. */
export function withCommonOptions(command: Command): Command {
  return command
    .option("--tier <tier>", `Trade cost against quality: ${TIERS.join(", ")}`)
    .option("-m, --model <id>", "Run this Model instead of the ranked choice")
    .option(
      "--param <key=value>",
      "A Model-only request field; repeat for more. Needs -m",
      collectParam
    )
    .option("--seed <n>", "Reproducible seed, where the Model takes one")
    .option("--dry-run", "Validate and price the call without running it")
    .option(
      "-o, --output <file-or-dir>",
      "Write here; a trailing / writes every output file"
    )
    .option(
      "--format <format>",
      "Output format: json, human, ndjson (default: auto-detect from TTY)"
    )
    .option("--fields <fields>", "Comma-separated fields to include in output")
    .option("--no-open", "Don't open the result in a viewer");
}

export function verbEmitOptions(options: VerbOptions): EmitOptions {
  return {
    fields: options.fields,
    format: resolveFormat(options.format),
    sanitize: true,
  };
}

/** A `--param` value: JSON when it parses, else the string as typed. */
function paramValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * `--param key=value` pairs as an object. Refused without `-m` before any
 * call: a Model-only field means nothing until the Model is named.
 */
export function parseParams(
  pairs: readonly string[] | undefined,
  model: string | undefined,
  format: OutputFormat
): Record<string, unknown> | undefined {
  if (pairs === undefined || pairs.length === 0) {
    return undefined;
  }
  if (!hasText(model)) {
    handleError(
      new Error(
        "--param sets a Model-only field, so it needs -m <id> naming the Model"
      ),
      "INVALID_OPTION",
      format
    );
  }
  const params: Record<string, unknown> = {};
  for (const pair of pairs) {
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      handleError(
        new Error(`--param takes key=value: ${JSON.stringify(pair)}`),
        "INVALID_OPTION",
        format
      );
    }
    params[pair.slice(0, separator)] = paramValue(pair.slice(separator + 1));
  }
  return params;
}

/** The TaskInput fields the common flags set. */
export function commonInput(
  options: VerbOptions,
  format: OutputFormat
): TaskInput {
  const params = parseParams(options.param, options.model, format);
  let tier: Tier | undefined;
  let seed: number | undefined;
  try {
    tier = hasText(options.tier)
      ? validateEnumOption(options.tier, TIERS, "tier")
      : undefined;
    seed = hasText(options.seed)
      ? parseIntegerOption(options.seed, "seed")
      : undefined;
  } catch (error) {
    handleError(error, "INVALID_OPTION", format);
  }
  return {
    ...(hasText(options.model) && { model: options.model }),
    ...(params !== undefined && { params }),
    ...(seed !== undefined && { seed }),
    ...(tier !== undefined && { tier }),
  };
}

/**
 * The single mode flag the caller set, or undefined for none. Two is an error
 * rather than a silent precedence rule: an agent passing `--noise --tone` has
 * a wrong model of the command, and picking one for it hides that.
 */
export function exclusiveFlag<T extends string>(
  options: VerbOptions,
  flags: readonly T[],
  verb: string,
  format: OutputFormat
): T | undefined {
  const chosen = flags.filter((flag) => {
    const value = options[flag];
    return value === true || (typeof value === "string" && value !== "");
  });
  if (chosen.length > 1) {
    handleError(
      new Error(
        `motif ${verb} takes one mode at a time; got ${chosen
          .map((flag) => `--${flag}`)
          .join(" ")}`
      ),
      "INVALID_OPTION",
      format
    );
  }
  return chosen[0];
}
