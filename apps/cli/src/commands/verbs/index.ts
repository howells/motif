/**
 * Routing for the Task verbs: one command per Task, each run through the SDK
 * client. `generate` is the one Task routed through the top-level program,
 * because `motif "prompt"` is the same command.
 */

import { Command } from "commander";

import { loadConfig } from "../../utils/config";
import { formatForParseErrors, routeCommanderErrors } from "../../utils/errors";
import { registerVary } from "../vary";
import { registerTaskVerb } from "./register-verb";
import { TASK_VERBS } from "./task-verbs";

export const VERB_NAMES = [
  ...TASK_VERBS.map((definition) => definition.command),
  "vary",
];

export function isVerbName(value: string | undefined): boolean {
  return value !== undefined && VERB_NAMES.includes(value);
}

export async function runVerbs(args: string[]): Promise<void> {
  const config = await loadConfig();
  const program = routeCommanderErrors(
    new Command()
      .name("motif")
      .description("One verb per Task, each run through the Task client"),
    formatForParseErrors(args)
  );

  for (const definition of TASK_VERBS) {
    registerTaskVerb(program, definition, config);
  }
  registerVary(program, config);

  await program.parseAsync(["node", "motif", ...args]);
}
