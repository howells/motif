import type { TaskId } from "@howells/motif-sdk";

import { SITE } from "@/lib/site/content";
import type { Command } from "@/lib/site/home/types";

/** A page of the docs site, which the main site serves under `/docs`. Pass
 * nothing for the docs' front page. */
export function docs(page?: string): string {
  return page === undefined ? "/docs" : `/docs/${page}`;
}

/** A command that runs a Task, linked to that Task's command page. */
export function taskCommand(task: TaskId, text: string): Command {
  return { docs: docs(`commands/${task}`), text };
}

/** The CLI commands with a docs page of their own that are not Tasks. */
type CliCommandId = "series" | "sheet";

/** A command that is not a Task (`motif series run`, `motif sheet`), linked
 * to its command page. */
export function cliCommand(command: CliCommandId, text: string): Command {
  return { docs: docs(`commands/${command}`), text };
}

/** The install line, linked to the quickstart that follows it. */
export const INSTALL: Command = {
  docs: docs("quickstart"),
  text: SITE.install,
};
