/**
 * A command's `--describe` schema, derived from the commander command itself.
 *
 * Every option and argument the command declares becomes an input property
 * through one mapping, so the schema cannot list a flag the command does not
 * take, or omit one it does. `notes.ts` and `outputs.ts` hold only what
 * commander does not know.
 */

import { isTaskId, TASKS } from "@howells/motif-sdk";
import type { TaskId } from "@howells/motif-sdk";
import type { Argument, Command, Option } from "commander";

import { TASK_VERBS } from "../verbs/task-verbs";
import { COMMAND_TASKS, commandTask, taskRouting } from "../verbs/tasks";
import { promptSource, usageLine } from "../verbs/verb-kit";
import type { VerbDefinition } from "../verbs/verb-kit";
import {
  COMMAND_NOTES,
  COMMON_NOTES,
  ANSWER_FLAGS,
  GLOBAL_INPUTS,
  modelNote,
  propertyKeys,
  VERB_NOTES,
} from "./notes";
import type { Schema } from "./notes";
import { COMMAND_PROSE, verbOutput } from "./outputs";
import { taskDetails } from "./tasks";

/** A command's schema, with the input the tests and callers read typed. */
export type CommandSchema = Schema & {
  input: {
    properties: Record<string, Schema>;
    required?: unknown;
    type: string;
  };
};

/** The options and arguments one commander command declares. */
interface Inputs {
  arguments: readonly Argument[];
  options: readonly Option[];
}

/** The Task whose Models `-m` takes on a command. */
function modelTask(name: string): TaskId | undefined {
  if (name === "series") {
    return "generate";
  }
  return isTaskId(name) ? name : undefined;
}

/** A flag nobody wrote a note for: commander's help line and the flag. */
function optionSchema(option: Option): Schema {
  return {
    description: `${option.description} (CLI: ${option.long ?? option.flags})`,
    ...(option.argChoices !== undefined && { enum: option.argChoices }),
    type: option.required || option.optional ? "string" : "boolean",
  };
}

function argumentSchema(argument: Argument): Schema {
  const description =
    argument.description === ""
      ? `CLI argument <${argument.name()}>`
      : argument.description;
  return argument.variadic
    ? { description, items: { type: "string" }, type: "array" }
    : { description, type: "string" };
}

/** The input properties of a command, keyed by property name. */
function inputProperties(
  name: string,
  inputs: readonly Inputs[],
  extra: {
    skip: ReadonlySet<string>;
    synthesized: readonly string[];
    verb: boolean;
  }
): Record<string, Schema> {
  const { skip: skipOptions, synthesized, verb } = extra;
  const task = modelTask(name);
  const commandNotes = COMMAND_NOTES[name] ?? {};
  const notes: Record<string, Schema> = {
    ...COMMON_NOTES,
    ...(verb ? VERB_NOTES : {}),
    ...(task === undefined ? {} : { model: modelNote(task) }),
    ...commandNotes,
  };
  const keys = propertyKeys(name);
  const found = new Map<string, Schema>();
  const add = (key: string, fallback: Schema) => {
    if (!found.has(key)) {
      found.set(key, notes[key] ?? fallback);
    }
  };

  for (const source of inputs) {
    for (const option of source.options) {
      const attribute = option.attributeName();
      if (
        option.negate ||
        GLOBAL_INPUTS.has(attribute) ||
        skipOptions.has(attribute)
      ) {
        continue;
      }
      add(keys[attribute] ?? attribute, optionSchema(option));
    }
    // A verb's positionals are its source and prompt, described apart.
    for (const argument of verb ? [] : source.arguments) {
      add(keys[argument.name()] ?? argument.name(), argumentSchema(argument));
    }
  }

  for (const key of Object.keys(commandNotes)) {
    if (!found.has(key) && !synthesized.includes(key)) {
      throw new Error(
        `The --describe notes for ${name} describe "${key}", which ${name} does not take`
      );
    }
  }
  return Object.fromEntries(found);
}

function sortedProperties(
  properties: Record<string, Schema>
): Record<string, Schema> {
  return Object.fromEntries(
    Object.entries(properties).toSorted(([a], [b]) => a.localeCompare(b))
  );
}

/** What a Task verb takes beyond its flags: a source, a prompt, one mode. */
function verbInputs(definition: VerbDefinition): Record<string, Schema> {
  const task = TASKS[definition.task];
  const modes: readonly { id: string; summary: string }[] =
    "modes" in task ? task.modes : [];
  const promptFrom = promptSource(definition);
  return {
    imagePath: {
      description:
        definition.sourceKind === "image-or-video"
          ? "Source image or video path. Falls back to the last generation when omitted."
          : "Source image path. Falls back to the last generation when omitted.",
      type: "string",
    },
    ...(modes.length > 0 && {
      mode: {
        description: `One mode at a time, passed as a flag such as --${modes[0]?.id ?? "mode"}`,
        enum: modes.map((mode) => mode.id),
        enumDescriptions: Object.fromEntries(
          modes.map((mode) => [mode.id, mode.summary])
        ),
        type: "string",
      },
    }),
    ...(promptFrom !== undefined && {
      prompt: { description: `Prompt: ${promptFrom}`, type: "string" },
    }),
  };
}

/** The Task verb a command is, if it is one. */
function verbOf(command: Command): VerbDefinition | undefined {
  return TASK_VERBS.find((verb) => verb.command === command.name());
}

/** Every command in the tree below `command`, itself first. */
function family(command: Command): Command[] {
  return [command, ...command.commands.flatMap(family)];
}

function inputsOf(command: Command): Inputs[] {
  return family(command).map((member) => ({
    arguments: member.registeredArguments,
    options: member.options,
  }));
}

function hasOption(command: Command, attribute: string): boolean {
  return family(command).some((member) =>
    member.options.some((option) => option.attributeName() === attribute)
  );
}

/**
 * The `input` of a flag-routed command, such as history: the root flags it
 * reads, described the same way.
 */
export function flagInput(
  name: string,
  owner: Command,
  attributes: readonly string[]
): Schema {
  const options = owner.options.filter((option) =>
    attributes.includes(option.attributeName())
  );
  return {
    properties: sortedProperties(
      inputProperties(name, [{ arguments: [], options }], {
        skip: new Set(),
        synthesized: [],
        verb: false,
      })
    ),
    type: "object",
  };
}

/**
 * A command's schema: its routing, its Task's details when it is one, the
 * input its options and arguments make, and the prose that is not derived.
 */
export function commandSchema(command: Command): CommandSchema {
  const name = command.name();
  const verb = verbOf(command);
  const prose: Schema = COMMAND_PROSE[name] ?? {};
  const modeFlags = new Set(
    (verb?.modes ?? []).map((flag) => `--${flag.mode}`)
  );
  const skipped = new Set(
    command.options
      .filter(
        (option) => option.long !== undefined && modeFlags.has(option.long)
      )
      .map((option) => option.attributeName())
  );
  if (name === "generate") {
    for (const flag of ANSWER_FLAGS) {
      skipped.add(flag);
    }
  }
  const synthesized = verb === undefined ? [] : Object.keys(verbInputs(verb));
  const properties = {
    ...(verb === undefined ? {} : verbInputs(verb)),
    ...inputProperties(name, inputsOf(command), {
      skip: skipped,
      synthesized,
      verb: verb !== undefined,
    }),
  };
  const { description, output, required, ...rest } = prose;
  const writesFiles = verb?.writesFiles?.() ?? true;
  const input = {
    properties: sortedProperties(properties),
    ...(required !== undefined && { required }),
    type: "object",
  };
  const schema: Schema = {
    command: name,
    description: description ?? command.description(),
    ...(verb !== undefined && { usage: usageLine(verb) }),
    input,
    mutating: verb === undefined ? true : writesFiles,
    output: output ?? verbOutput(writesFiles),
    ...rest,
    ...(command.commands.length > 0 && {
      subcommands: command.commands.map((sub) => sub.name()),
      subcommandTasks: Object.fromEntries(
        command.commands.flatMap((sub) => {
          const row = COMMAND_TASKS.find(
            (candidate) => candidate.command === `${name} ${sub.name()}`
          );
          return row === undefined ? [] : [[sub.name(), taskRouting(row)]];
        })
      ),
    }),
    supports_dry_run: hasOption(command, "dryRun"),
  };
  return {
    command: name,
    description: schema.description,
    ...taskRouting(commandTask(name)),
    ...taskDetails(name),
    ...schema,
    input,
  };
}

/**
 * The flags every described command declares, as `flags: help line`. These are
 * the ones a caller can put on any command; the rest belong to the commands
 * whose input lists them.
 */
export function globalFlags(
  commands: readonly Command[]
): Record<string, string> {
  const [first, ...others] = commands;
  if (first === undefined) {
    return {};
  }
  return Object.fromEntries(
    first.options
      .filter((option) =>
        others.every((command) =>
          command.options.some((other) => other.long === option.long)
        )
      )
      .map((option) => [option.flags, option.description])
  );
}
