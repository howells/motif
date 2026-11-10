/**
 * What a command says about itself on the command line, as commander words
 * it: the synopsis, each option's flag and help line, each subcommand. The
 * docs site writes its command pages from this, so a page cannot describe a
 * flag the command does not take.
 */

import type { Command, Option } from "commander";

import { ANSWER_FLAGS } from "./notes";
import type { Schema } from "./notes";

/** One option, as `--help` prints it: the flags, and the help line with its default. */
function optionFact(command: Command, option: Option): Schema {
  const help = command.createHelp();
  return {
    description: help.optionDescription(option),
    flags: help.optionTerm(option),
    long: option.long ?? option.flags,
  };
}

function optionFacts(command: Command, options: readonly Option[]): Schema[] {
  return options.map((option) => optionFact(command, option));
}

/** The options a command takes, in the order they are declared. The root's
 * answer flags (`--history` and the rest) are commands of their own. */
function ownOptions(command: Command): readonly Option[] {
  return command.name() === "generate"
    ? command.options.filter(
        (option) => !ANSWER_FLAGS.includes(option.attributeName())
      )
    : command.options;
}

/** The synopsis, with the default command spelled as it is typed: `motif [prompt]`. */
function synopsis(command: Command, isDefault: boolean): string {
  const usage = command.createHelp().commandUsage(command);
  return isDefault ? usage.replace("motif generate", "motif") : usage;
}

/**
 * A command's command-line facts. `generate` is the default command, so its
 * synopsis leaves its name out.
 */
export function cliFacts(command: Command): Schema {
  const help = command.createHelp();
  const isDefault = command.name() === "generate";
  return {
    options: optionFacts(command, ownOptions(command)),
    synopsis: synopsis(command, isDefault),
    ...(command.commands.length > 0 && {
      subcommands: command.commands.map((sub) => ({
        description: help.subcommandDescription(sub),
        name: sub.name(),
        options: optionFacts(sub, ownOptions(sub)),
        synopsis: synopsis(sub, false),
      })),
    }),
  };
}

/**
 * The command-line facts of a command that is a flag on the root, such as
 * `--last`: the root flags it reads, in the order given.
 */
export function flagCliFacts(
  owner: Command,
  attributes: readonly string[],
  usage: string
): Schema {
  const options = attributes.map((attribute) => {
    const found = owner.options.find(
      (option) => option.attributeName() === attribute
    );
    if (found === undefined) {
      throw new Error(`The root has no --${attribute} flag`);
    }
    return found;
  });
  return { options: optionFacts(owner, options), synopsis: usage };
}

/**
 * The options every Task verb carries, which the docs list once: those the
 * first verb declares that all the others declare too.
 */
export function commonOptions(verbs: readonly Command[]): Schema[] {
  const [first, ...others] = verbs;
  if (first === undefined) {
    throw new Error("The program has no Task verbs");
  }
  return optionFacts(
    first,
    first.options.filter((option) =>
      others.every((verb) =>
        verb.options.some((other) => other.long === option.long)
      )
    )
  );
}
