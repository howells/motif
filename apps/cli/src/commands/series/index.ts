/**
 * Series commands — consistent styling across related images.
 *
 * motif series create "My Series" --from cover.png --style "watercolor..."
 * motif series ref add "my-series" character.png --tag character
 * motif series gen "my-series" "Luna walks through the forest" --refs character
 * motif series list
 * motif series show "my-series"
 * motif series history "my-series"
 */

import { TIERS } from "@howells/motif-sdk";
import { Command } from "commander";

import { formatForParseErrors, routeCommanderErrors } from "../../utils/errors";
import { resolveFormat } from "../../utils/output";
import type { EmitOptions } from "../../utils/output";
import { cmdGenerate } from "./gen";
import {
  cmdCreate,
  cmdDelete,
  cmdHistory,
  cmdList,
  cmdRefAdd,
  cmdRefRemove,
  cmdShow,
} from "./manage";
import { cmdRun } from "./run";

export async function runSeries(args: string[]): Promise<void> {
  const program = routeCommanderErrors(
    new Command()
      .name("motif series")
      .description("Manage image series for consistent styling")
      .option(
        "--format <format>",
        "Output format: json, human, ndjson (default: auto-detect from TTY)"
      )
      .option(
        "--fields <fields>",
        "Comma-separated fields to include in output"
      ),
    formatForParseErrors(args)
  );
  const emitOpts = (): EmitOptions => {
    const { fields, format } = program.opts<{
      fields?: string;
      format?: string;
    }>();
    return { fields, format: resolveFormat(format), sanitize: true };
  };

  program
    .command("create <name>")
    .description("Create a new series")
    .option("--from <image>", "Initial style reference image")
    .option("--style <prompt>", "Style prompt prefix for all generations")
    .option("--look <id>", "Pin a house look for every image, e.g. editorial")
    .option("--mood <id>", "Pin a light mood for every image, e.g. overcast")
    .option(
      "-a, --aspect <ratio>",
      "Default aspect ratio (default: the look's)"
    )
    .option("-r, --resolution <res>", "Default resolution")
    .action(async (name: string, opts: Parameters<typeof cmdCreate>[1]) => {
      await cmdCreate(name, opts, emitOpts());
    });

  program
    .command("list")
    .description("List all series")
    .action(async () => {
      await cmdList(emitOpts());
    });

  program
    .command("show <slug>")
    .description("Show series details")
    .action(async (slug: string) => {
      await cmdShow(slug, emitOpts());
    });

  program
    .command("ref-add <slug> <image>")
    .description("Add a reference image to a series")
    .option(
      "-t, --tag <tag>",
      "Tag for the reference (e.g. character, location)",
      "style"
    )
    .option("-d, --description <desc>", "Description of the reference")
    .action(
      async (
        slug: string,
        image: string,
        opts: Parameters<typeof cmdRefAdd>[2]
      ) => {
        await cmdRefAdd(slug, image, opts, emitOpts());
      }
    );

  program
    .command("ref-remove <slug> <filename>")
    .description("Remove a reference image from a series")
    .action(async (slug: string, filename: string) => {
      await cmdRefRemove(slug, filename, emitOpts());
    });

  program
    .command("gen <slug> <prompt>")
    .description("Generate an image in a series with consistent styling")
    .option(
      "--refs <tags>",
      "Comma-separated ref tags to include (default: all)"
    )
    .option("-a, --aspect <ratio>", "Aspect ratio (overrides series default)")
    .option("-r, --resolution <res>", "Resolution (overrides series default)")
    .option("-m, --model <model>", "Model (overrides series default)")
    .option("-o, --output <file>", "Output filename")
    .option("-n, --num <count>", "Number of images 1-4")
    .option("--look <id>", "House look id, e.g. editorial")
    .option("--mood <id>", "Light mood id, e.g. overcast")
    .option("--no-mood", "Drop any mood, including the series' pinned one")
    .option("--open", "Open the result in a viewer")
    .option("--dry-run", "Validate without API call")
    .action(
      async (
        slug: string,
        prompt: string,
        opts: Parameters<typeof cmdGenerate>[2]
      ) => {
        await cmdGenerate(slug, prompt, opts, emitOpts());
      }
    );

  program
    .command("run <theme>")
    .description("Plan and generate a themed multi-image series run")
    .option("-c, --count <n>", "Number of images to generate", "4")
    .option("--series <slug>", "Existing series to run inside")
    .option("--style <prompt>", "Shared style prompt for the run")
    .option(
      "--refs <tags>",
      "Comma-separated ref tags to include from an existing series"
    )
    .option("-a, --aspect <ratio>", "Aspect ratio")
    .option("-r, --resolution <res>", "Resolution")
    .option("-m, --model <model>", "Model")
    .option("--tier <tier>", `Trade cost against quality: ${TIERS.join(", ")}`)
    .option("--look <id>", "House look id, e.g. editorial")
    .option("--mood <id>", "Light mood id, e.g. overcast")
    .option("--no-mood", "Drop any mood, including the series' pinned one")
    .option("--open", "Open the result in a viewer")
    .option("--dry-run", "Validate and plan without API call")
    .action(async (theme: string, opts: Parameters<typeof cmdRun>[1]) => {
      await cmdRun(theme, opts, emitOpts());
    });

  program
    .command("history <slug>")
    .description("Show generation history for a series")
    .option("--limit <n>", "Entries per page", "10")
    .option("--offset <n>", "Skip first N entries", "0")
    .action(async (slug: string, opts: Parameters<typeof cmdHistory>[1]) => {
      await cmdHistory(slug, opts, emitOpts());
    });

  program
    .command("delete <slug>")
    .description("Delete a series and all its data")
    .action(async (slug: string) => {
      await cmdDelete(slug, emitOpts());
    });

  await program.parseAsync(["node", "motif-series", ...args]);
}
