import { render } from "ink";
import React from "react";

import { runCli } from "./cli";
import { refuseRemovedArgs } from "./commands/removed";
import { runSeries } from "./commands/series";
import { runSheet } from "./commands/sheet";
import { isVerbName, runVerbs } from "./commands/verbs";
import { App } from "./studio/app";
import { loadConfig, loadHistory, saveConfig } from "./utils/config";
import type { MotifConfig } from "./utils/config";
import { formatForParseErrors } from "./utils/errors";

async function main() {
  const config = await loadConfig();

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

  // Removed commands and flags name their replacement instead of parsing.
  refuseRemovedArgs(args, formatForParseErrors(args));

  // `motif generate "prompt"` is `motif "prompt"`.
  const cliArgs = args[0] === "generate" ? args.slice(1) : args;
  await runCli(["node", "motif", ...cliArgs], config);
}

async function launchStudio() {
  let config = await loadConfig();
  let history = await loadHistory();

  const handleConfigChange = async (newConfig: Partial<MotifConfig>) => {
    await saveConfig(newConfig);
    config = { ...config, ...newConfig };
  };

  const handleHistoryChange = async () => {
    history = await loadHistory();
    // Re-render with new history
    rerender(
      React.createElement(App, {
        config,
        history,
        onConfigChange: handleConfigChange,
        onHistoryChange: handleHistoryChange,
      })
    );
  };

  const { rerender, waitUntilExit } = render(
    React.createElement(App, {
      config,
      history,
      onConfigChange: handleConfigChange,
      onHistoryChange: handleHistoryChange,
    })
  );

  await waitUntilExit();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
