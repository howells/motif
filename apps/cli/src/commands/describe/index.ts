/**
 * Schema introspection for agent-first CLI design.
 *
 * `motif --describe` returns the machine-readable schema of every command and
 * `motif --describe <command>` that of one. The commands are the ones on the
 * commander program, so a flag cannot be added without `--describe` knowing it;
 * see `derive.ts`. Model enums come from each Task's ranked Models, so they
 * always match what the SDK can resolve.
 */

import { ASPECT_RATIOS, RESOLUTIONS } from "@howells/motif-sdk";
import type { Command } from "commander";

import { ERROR_CATALOG } from "../../utils/error-catalog";
import { emitDocument } from "../../utils/output";
import type { EmitOptions } from "../../utils/output";
import { hasText } from "../../utils/text";
import { PACKAGE_VERSION } from "../../version";
import { TASK_VERBS } from "../verbs/task-verbs";
import { commandTask, TASK_INDEX, taskRouting } from "../verbs/tasks";
import { commonOptions, flagCliFacts } from "./cli";
import { commandSchema, flagInput, globalFlags } from "./derive";
import type { Schema } from "./notes";
import { FLAG_COMMANDS, HISTORY_OUTPUT } from "./outputs";
import { taskModelIds, tasksSchema } from "./tasks";

/** Commands that run Studio rather than a command with a schema. */
const UNDESCRIBED = new Set(["studio"]);

/** The command whose flags `motif --history` reads: the default one. */
function generateOf(program: Command): Command {
  const generate = program.commands.find(
    (command) => command.name() === "generate"
  );
  if (generate === undefined) {
    throw new Error("The program has no generate command");
  }
  return generate;
}

/** The flags `motif --history` reads. */
const HISTORY_FLAGS = ["limit", "offset"];

/** Commands that are flags on the root rather than subcommands. */
const FLAG_COMMAND_NAMES = ["describe", "errors", "history", "last"];

/** The root flags each flag command reads, in the order its page lists them, and how it is typed. */
const FLAG_CLI: Record<string, { attributes: string[]; synopsis: string }> = {
  describe: {
    attributes: ["describe", "format", "fields"],
    synopsis: "motif --describe [command]",
  },
  history: {
    attributes: ["history", "limit", "offset", "format", "fields"],
    synopsis: "motif --history [options]",
  },
  last: { attributes: ["last", "format", "fields"], synopsis: "motif --last" },
};

/** The subcommands that have a schema. */
function describedCommands(program: Command): Command[] {
  return program.commands.filter((command) => !UNDESCRIBED.has(command.name()));
}

/** Every name `--describe <command>` takes, sorted. */
function commandNames(program: Command): string[] {
  return [
    ...describedCommands(program).map((command) => command.name()),
    ...FLAG_COMMAND_NAMES,
  ].toSorted();
}

/** The schema of a command that is a flag, not a subcommand. */
function flagCommandSchema(name: string, program: Command): Schema {
  const row = commandTask(name);
  const schema: Schema = (() => {
    switch (name) {
      case "describe": {
        return {
          command: "describe",
          description: "Introspect CLI schema (this command)",
          input: {
            properties: {
              command: {
                description: "Specific command to describe (omit for all)",
                enum: [...commandNames(program), "tasks"],
                type: "string",
              },
            },
            type: "object",
          },
          mutating: false,
        };
      }
      case "history": {
        return {
          command: "history",
          description: "List generation history",
          input: flagInput("history", generateOf(program), HISTORY_FLAGS),
          mutating: false,
          output: HISTORY_OUTPUT,
        };
      }
      default: {
        return FLAG_COMMANDS[name] ?? {};
      }
    }
  })();
  const cli = FLAG_CLI[name];
  return {
    command: schema.command,
    description: schema.description,
    ...taskRouting(row),
    ...schema,
    ...(cli !== undefined && {
      cli: flagCliFacts(generateOf(program), cli.attributes, cli.synopsis),
    }),
  };
}

function schemaOf(name: string, program: Command): Schema | undefined {
  const command = program.commands.find(
    (candidate) => candidate.name() === name
  );
  if (command !== undefined && !UNDESCRIBED.has(name)) {
    return commandSchema(command);
  }
  return FLAG_COMMAND_NAMES.includes(name)
    ? flagCommandSchema(name, program)
    : undefined;
}

/** Full CLI schema with all commands, enums, and errors */
function fullSchema(program: Command) {
  return {
    // First, so the opening bytes of a large schema are the routing table.
    tasks: TASK_INDEX,
    commands: Object.fromEntries(
      commandNames(program).map((name) => [name, schemaOf(name, program)])
    ),
    // The options every Task verb takes, so a reader lists them once.
    common_options: commonOptions(
      describedCommands(program).filter((command) =>
        TASK_VERBS.some((verb) => verb.command === command.name())
      )
    ),
    description: "fal.ai image generation CLI",
    enums: {
      aspect_ratios: ASPECT_RATIOS,
      generation_models: taskModelIds("generate"),
      resolutions: RESOLUTIONS,
    },
    errors: ERROR_CATALOG,
    global_flags: globalFlags(describedCommands(program)),
    input_modes: {
      combined: "Stdin JSON for base config, flags override specific fields.",
      flags: "Traditional CLI flags (e.g. motif 'a cat' -m gpt --og)",
      stdin_json:
        'Pipe a JSON payload to stdin: echo \'{"prompt":"a cat","model":"gpt"}\' | motif',
    },
    name: "motif",
    security_posture:
      "The agent is not a trusted operator. All inputs are validated. Output paths must stay inside the git root of the current directory (or the current directory outside a repo). Use --dry-run before mutating commands.",
    version: PACKAGE_VERSION,
  };
}

/** Run the describe command. The schema is the CLI's own text, so it is not
 * sanitized: a synopsis such as `<prompt>` must reach the reader as written. */
export function runDescribe(
  program: Command,
  commandName: string | undefined,
  emitted: EmitOptions
): void {
  const options: EmitOptions = { ...emitted, sanitize: false };
  if (commandName === "tasks") {
    emitDocument(tasksSchema(), options);
  } else if (hasText(commandName)) {
    const schema = schemaOf(commandName, program);
    if (schema === undefined) {
      throw new Error(
        `Unknown command: ${commandName}. Available: ${[...commandNames(program), "tasks"].join(", ")}`
      );
    }
    emitDocument(schema, options);
  } else {
    emitDocument(fullSchema(program), options);
  }
}
