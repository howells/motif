/**
 * `motif studio`: the interactive terminal Studio, launched only when asked for.
 */

import type { Command } from "commander";
import { render } from "ink";
import React from "react";

import { App } from "../studio/app";
import { loadConfig, loadHistory } from "../utils/config";

export function registerStudio(program: Command): void {
  program
    .command("studio")
    .description("The interactive terminal Studio")
    .action(async () => {
      const [config, history] = await Promise.all([
        loadConfig(),
        loadHistory(),
      ]);
      const { waitUntilExit } = render(
        React.createElement(App, { config, history })
      );
      await waitUntilExit();
    });
}
