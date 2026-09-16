/**
 * Turns a Task verb definition into a commander command: positionals split
 * into prompt and source, the mode flag checked, then the `runTask` kernel.
 */

import { existsSync } from "node:fs";

import { TASKS } from "@howells/motif-sdk";
import type { Command } from "commander";

import type { MotifConfig } from "../../utils/config";
import type { OutputFormat } from "../../utils/output";
import { hasText } from "../../utils/text";
import { runTask } from "../task-run";
import {
  commonInput,
  exclusiveFlag,
  verbEmitOptions,
  withCommonOptions,
} from "./shared";
import type { VerbOptions } from "./shared";
import { invalid, stringOption } from "./verb-kit";
import type { VerbDefinition } from "./verb-kit";

const SOURCE_PATH_REGEX =
  /\.(png|jpe?g|webp|gif|avif|tiff?|mp4|mov|m4v|webm)$/i;

/** `motif <command> <usage>`, as errors quote it. */
export function usageLine(definition: VerbDefinition): string {
  return `motif ${definition.command} ${definition.usage}`;
}

function needsPrompt(definition: VerbDefinition, format: OutputFormat): never {
  const alternative =
    definition.promptFlag === undefined
      ? ""
      : ` or ${definition.promptFlag.usage}`;
  invalid(
    `motif ${definition.command} needs a prompt${alternative}: ${usageLine(definition)}`,
    format
  );
}

/** Whether an argument names an existing image or video file. */
function isSourcePath(arg: string | undefined): arg is string {
  return hasText(arg) && SOURCE_PATH_REGEX.test(arg) && existsSync(arg);
}

/** Split positionals into the prompt and the source, per the chosen mode. */
function positionals(
  definition: VerbDefinition,
  args: readonly (string | undefined)[],
  mode: string | undefined,
  options: VerbOptions,
  format: OutputFormat
): { prompt?: string; source?: string } {
  const [first, second] = args;
  const modeFlag = definition.modes.find((flag) => flag.mode === mode);
  const flagPrompt =
    modeFlag?.valueIsPrompt === true
      ? stringOption(options, modeFlag.mode)
      : undefined;
  const promptOptional =
    definition.promptFlag !== undefined &&
    stringOption(options, definition.promptFlag.key) !== undefined;
  if (definition.promptFirst(mode, options) && isSourcePath(first)) {
    // `motif relight kitchen.jpg "low sun"`: the image may come first.
    if (hasText(second) && !isSourcePath(second)) {
      return { prompt: second, source: first };
    }
    // `motif tile photo.png`, `motif relight kitchen.jpg --mood dawn`: a lone
    // image is the source when the Task can run without a prompt.
    if (
      !hasText(second) &&
      (promptOptional || definition.sourceOptional?.(mode) === true)
    ) {
      return { source: first };
    }
  }
  if (definition.promptFirst(mode, options)) {
    if (!hasText(first) && promptOptional) {
      return {};
    }
    if (!hasText(first) || isSourcePath(first)) {
      needsPrompt(definition, format);
    }
    return { prompt: first, source: second };
  }
  if (hasText(second)) {
    invalid(
      `motif ${definition.command}${mode === undefined ? "" : ` --${mode}`} takes only a source path; got ${JSON.stringify(first)} and ${JSON.stringify(second)}. Usage: ${usageLine(definition)}`,
      format
    );
  }
  return { prompt: flagPrompt, source: first };
}

export function registerTaskVerb(
  program: Command,
  definition: VerbDefinition,
  config: MotifConfig
): void {
  const takesTwo = definition.usage.split(" ").length > 1;
  let command = program
    .command(definition.command)
    .description(TASKS[definition.task].summary)
    .argument("[first]")
    .usage(`${definition.usage} [options]`);
  if (takesTwo) {
    command = command.argument("[second]");
  }
  for (const flag of definition.modes) {
    command = command.option(
      flag.value === undefined
        ? `--${flag.mode}`
        : `--${flag.mode} <${flag.value}>`,
      flag.description
    );
  }
  command = definition.options?.(command) ?? command;
  withCommonOptions(command).action(async (...received: unknown[]) => {
    const args = received
      .slice(0, takesTwo ? 2 : 1)
      .map((value) => (typeof value === "string" ? value : undefined));
    const options = command.opts<VerbOptions>();
    const emitOpts = verbEmitOptions(options);
    const { format } = emitOpts;
    const common = commonInput(options, format);
    const mode = exclusiveFlag(
      options,
      definition.modes.map((flag) => flag.mode),
      definition.command,
      format
    );
    const { prompt, source } = positionals(
      definition,
      args,
      mode,
      options,
      format
    );
    const extra = (await definition.input?.(options, format, mode)) ?? {};

    await runTask(
      {
        command: definition.command,
        ...(definition.data !== undefined && { data: definition.data }),
        ...(definition.extension !== undefined && {
          extension: definition.extension,
        }),
        input: {
          ...common,
          ...extra,
          ...(mode !== undefined && { mode }),
          ...(hasText(prompt) && { prompt }),
        },
        outputSuffix:
          mode === undefined
            ? `-${definition.command}`
            : `-${definition.command}-${mode}`,
        ...(definition.quiet === true && { quiet: true }),
        ...(definition.render !== undefined && { render: definition.render }),
        sourceKind: definition.sourceKind,
        ...(definition.sourceOptional?.(mode) === true && {
          sourceOptional: true,
        }),
        task: definition.task,
        verb: definition.verb,
        writesFiles: definition.writesFiles?.(mode) ?? true,
      },
      {
        dryRun: options.dryRun === true,
        noOpen: options.open === false,
        output: options.output,
        source,
      },
      config,
      emitOpts
    );
  });
}
