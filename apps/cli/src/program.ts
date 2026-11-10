/**
 * The one commander program: `generate` is the default command, and `vary`,
 * every Task verb, `sheet`, `series` and `studio` are its siblings. Execution
 * and `--describe` both read this tree.
 */

import { Command, Help } from "commander";

import { registerGenerate } from "./cli";
import { registerSeries } from "./commands/series";
import { registerSheet } from "./commands/sheet";
import { registerStudio } from "./commands/studio";
import { registerVerbs } from "./commands/verbs";
import { formatForParseErrors, routeCommanderErrors } from "./utils/errors";
import { PACKAGE_VERSION } from "./version";

const isHelp = (option: { long?: string }) => option.long === "--help";

/**
 * The bare program's help is generate's: its description lists every command
 * by task, and its flags are the ones that run first when no command is named.
 * Commander would otherwise list the commands again and leave the flags to
 * `motif generate --help`.
 */
function showGenerateHelp(program: Command, generate: Command): void {
  const base = new Help();
  program.usage("[options] [prompt]").configureHelp({
    visibleArguments: () => base.visibleArguments(generate),
    visibleCommands: () => [],
    visibleOptions: (command) => {
      const own = base.visibleOptions(command);
      return [
        ...own.filter((option) => !isHelp(option)),
        ...base.visibleOptions(generate).filter((option) => !isHelp(option)),
        ...own.filter(isHelp),
      ];
    },
  });
}

/** Build the program. `args` are the arguments, read only for the error format. */
export function buildProgram(args: string[]): Command {
  const format = formatForParseErrors(args);
  const program = routeCommanderErrors(
    new Command().name("motif").version(PACKAGE_VERSION),
    format
  );
  const generate = registerGenerate(program, format);
  registerVerbs(program);
  registerSheet(program);
  registerSeries(program);
  registerStudio(program);
  program.description(generate.description());
  showGenerateHelp(program, generate);
  return program;
}

/** Run `args` (without `node` and the script) through the program. */
export async function runProgram(args: string[]): Promise<void> {
  await buildProgram(args).parseAsync(args, { from: "user" });
}
