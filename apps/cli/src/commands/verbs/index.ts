/**
 * One commander command per Task verb, each run through the SDK client.
 * `generate` is the one Task registered elsewhere, because `motif "prompt"` is
 * the same command.
 */

import type { Command } from "commander";

import { registerVary } from "../vary";
import { registerTaskVerb } from "./register-verb";
import { TASK_VERBS } from "./task-verbs";

export function registerVerbs(program: Command): void {
  registerVary(program);
  for (const definition of TASK_VERBS) {
    registerTaskVerb(program, definition);
  }
}
