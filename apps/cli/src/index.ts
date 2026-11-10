import { render } from "ink";
import React from "react";

import { runCli } from "./cli";
import { runSeries } from "./commands/series";
import { runSheet } from "./commands/sheet";
import { isVerbName, runVerbs } from "./commands/verbs";
import { App } from "./studio/app";
import { loadConfig, loadHistory } from "./utils/config";
import {
  formatForParseErrors,
  handleError,
  isStoredFileError,
} from "./utils/errors";

async function main() {
  const args = process.argv.slice(2);

  // Route to series subcommand
  if (args[0] === "series") {
    await runSeries(args.slice(1));
    return;
  }

  // Route to the contact sheet command
  if (args[0] === "sheet") {
    await runSheet(args.slice(1));
    return;
  }

  // Route to a Task verb: one command per Task, run through the SDK client.
  if (isVerbName(args[0])) {
    await runVerbs(args);
    return;
  }

  // Launch terminal Studio only when explicitly requested.
  if (args[0] === "studio") {
    await launchStudio();
    return;
  }

  // `motif generate "prompt"` is `motif "prompt"`.
  const cliArgs = args[0] === "generate" ? args.slice(1) : args;
  await runCli(["node", "motif", ...cliArgs]);
}

async function launchStudio() {
  const [config, history] = await Promise.all([loadConfig(), loadHistory()]);
  const { waitUntilExit } = render(
    React.createElement(App, { config, history })
  );
  await waitUntilExit();
}

main().catch((error: unknown) => {
  if (isStoredFileError(error)) {
    handleError(
      error,
      "CORRUPT_FILE",
      formatForParseErrors(process.argv.slice(2))
    );
  }
  console.error(error);
  process.exit(1);
});
